import { useCallback, useEffect, useRef, useState } from 'react';
import { getLogger } from '@/app/_helpers/logger';

interface WebRTCConfig {
	iceServers?: RTCIceServer[];
	sdpSemantics: 'unified-plan';
}

const ICE_GATHER_TIMEOUT_MS = 2000;

async function waitForIceGathering(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
	if (pc.iceGatheringState === 'complete') {
		return;
	}
	await new Promise<void>((resolve) => {
		const done = () => {
			pc.removeEventListener('icegatheringstatechange', onChange);
			clearTimeout(timer);
			resolve();
		};
		const onChange = () => {
			if (pc.iceGatheringState === 'complete') {
				done();
			}
		};
		const timer = setTimeout(done, timeoutMs);
		pc.addEventListener('icegatheringstatechange', onChange);
	});
}

export function useWebRTC(url: string, onStreamStats?: (stats: RTCInboundRtpStreamStats) => void) {
	const videoElRef = useRef<HTMLVideoElement>(null);
	const audioElRef = useRef<HTMLVideoElement>(null);
	const peerConnection = useRef<RTCPeerConnection | null>(null);
	const urlRef = useRef<string>(url);
	urlRef.current = url;
	const isConnecting = useRef<boolean>(false);
	const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | null>(null);
	const remotePCId = useRef<string | null>(null);
	const reconnectAttempts = useRef(0);

	const onIceCandidate = useCallback((e: RTCPeerConnectionIceEvent) => {
		if (e.candidate) {
			return fetch(urlRef.current, {
				body: JSON.stringify({
					type: 'remote_candidate',
					id: remotePCId.current,
					candidates: [e.candidate],
				}),
				headers: {
					'Content-Type': 'application/json',
				},
				method: 'POST',
			}).catch(function (error) {
				window.console.error(error);
			});
		}
	}, []);

	const connect = useCallback(async () => {
		if (peerConnection.current) {
			peerConnection.current.close();
			peerConnection.current = null;
		}
		isConnecting.current = true;
		try {
			setConnectionState('connecting');
			var config: WebRTCConfig = {
				sdpSemantics: 'unified-plan',
			};

			if (document.getElementById('use-stun') && (document.getElementById('use-stun') as any).checked) {
				config.iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
			}

			let resParam: string | undefined;
			try {
				resParam = new URL(url, window.location.origin).searchParams.get('res') ?? undefined;
			} catch {
				resParam = undefined;
			}

			const response = await fetch(url, {
				body: JSON.stringify({
					type: 'request',
					res: resParam,
				}),
				headers: {
					'Content-Type': 'application/json',
				},
				method: 'POST',
			});
			if (response.ok) {
				const parsedResponse = (await response.json()) as {
					id: string;
					sdp: string;
					type: RTCSdpType;
					iceServers?: RTCIceServer[];
				};
				if (parsedResponse.iceServers) {
					config.iceServers = parsedResponse.iceServers;
				}
				peerConnection.current = new RTCPeerConnection(config);
				peerConnection.current.addTransceiver('video', { direction: 'recvonly' });
				peerConnection.current.addEventListener('track', function (evt) {
					if (evt.track.kind == 'video') {
						const video = videoElRef.current;
						if (!video) {
							throw new Error('No video ref to set src on');
						}
						video.srcObject = evt.streams[0];
						// Autoplay is often ignored until play() is called after the track arrives.
						void video.play().catch((err) => {
							getLogger().warn(err, 'video.play() blocked; user gesture may be required');
						});
					} else {
						if (audioElRef.current) audioElRef.current.srcObject = evt.streams[0];
					}
				});
				peerConnection.current.addEventListener('connectionstatechange', () => {
					const conState = peerConnection.current?.connectionState;
					setConnectionState(conState ?? null);
				});
				// Trickle ICE as candidates arrive (do not wait for gathering first).
				peerConnection.current.addEventListener('icecandidate', onIceCandidate);

				remotePCId.current = parsedResponse.id;
				await peerConnection.current.setRemoteDescription(parsedResponse);
				const answer = await peerConnection.current.createAnswer();
				await peerConnection.current.setLocalDescription(answer);
				// camera-streamer with empty iceServers can stall in "gathering" forever
				// in some browsers — wait with a hard timeout then send whatever we have.
				await waitForIceGathering(peerConnection.current, ICE_GATHER_TIMEOUT_MS);
				var offer = peerConnection.current.localDescription;

				if (offer == null) {
					throw new Error('No offer from peerConnection');
				}

				await fetch(url, {
					body: JSON.stringify({
						type: offer.type,
						id: remotePCId.current,
						sdp: offer.sdp,
					}),
					headers: {
						'Content-Type': 'application/json',
					},
					method: 'POST',
				});
			} else {
				setConnectionState('failed');
			}
		} catch (e) {
			getLogger().error(e, "Couldn't connect to WebRTC");
			setConnectionState('failed');
		} finally {
			isConnecting.current = false;
		}
	}, [onIceCandidate, url]);

	// Get stream stats
	useEffect(() => {
		if (onStreamStats) {
			const interval = setInterval(async () => {
				if (peerConnection.current) {
					const stats = await peerConnection.current.getStats();
					stats.forEach((report) => {
						if (report.type === 'inbound-rtp' && report.kind === 'video') {
							const data = report as RTCInboundRtpStreamStats;
							onStreamStats?.(data);
						}
					});
				}
			}, 1000);
			return () => clearInterval(interval);
		}
	}, [onStreamStats]);

	useEffect(() => {
		if (url && isConnecting.current === false) {
			connect();
		} else if (peerConnection.current && isConnecting.current === false) {
			peerConnection.current.close();
		}
	}, [connect, url]);

	useEffect(() => {
		if (['failed', 'disconnected'].includes(connectionState ?? '')) {
			if (reconnectAttempts.current >= 1) {
				return;
			}
			const reconnectTimeout = setTimeout(() => {
				if (isConnecting.current) {
					return;
				}
				reconnectAttempts.current += 1;
				connect();
			}, 3000);
			return () => clearTimeout(reconnectTimeout);
		}
		if (connectionState === 'connected') {
			reconnectAttempts.current = 0;
		}
	}, [connect, connectionState]);

	return {
		videoRef: videoElRef,
		audioRef: audioElRef,
		connectionState,
		close: useCallback(() => {
			peerConnection.current?.close();
		}, []),
	};
}
