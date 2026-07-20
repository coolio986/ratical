'use client';
/** vaoc.tsx — Part of the /configure/calibration VAOC (camera nozzle-offset) UI. See docs/ARCHITECTURE.md §4. */

import { useWebRTC } from '@/app/_hooks/webrtc';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { twJoin, twMerge } from 'tailwind-merge';
import { initialCameraSettings } from '@/app/calibration/vaoc-settings-dialog';
import { useMoonrakerState } from '@/moonraker/hooks';
import { Spinner } from '@/components/common/spinner';
import { useGestures, useSpatialMapping, useUIState, useVideoState } from '@/app/calibration/hooks';
import { Toolbars } from '@/app/calibration/toolbars';
import { SafetyVisualization } from '@/app/calibration/safety-visualization';
import { CrossHair } from '@/app/calibration/crosshair';
import { FillVideoFrame, FillViewport } from '@/app/calibration/framing';
import screenfull from 'screenfull';

/**
 * camera-streamer is MJPG-only on this printer. Continuous multipart /stream in an
 * <img> often freezes silently in Chromium (no onError). JPEG snapshot polling is
 * rock-solid for VAOC — use it as the primary feed. WebRTC is only used when the
 * <video> element actually has decoded frames.
 */
const SNAPSHOT_INTERVAL_MS = 100;
const SNAPSHOT_CANDIDATES = (base: string) => [`${base}/snapshot`, `${base}/?action=snapshot`];

export const VAOC = () => {
	const videoState = useVideoState();
	const { videoRef, connectionState } = useWebRTC(videoState.url + '/webrtc', videoState.onStreamStats);

	const [mjpegMode, setMjpegMode] = useState(true);
	const [snapshotReady, setSnapshotReady] = useState(false);
	const [candidateIdx, setCandidateIdx] = useState(0);
	const [frameToken, setFrameToken] = useState(0);
	const imgRef = useRef<HTMLImageElement | null>(null);
	const gestureMediaRef = useRef<HTMLVideoElement | null>(null);
	const inFlightRef = useRef(false);
	const lastFrameAtRef = useRef(0);

	const webrtcHasFrames =
		connectionState === 'connected' &&
		(videoRef.current?.readyState ?? 0) >= 2 &&
		(videoRef.current?.videoWidth ?? 0) > 0;

	const isConnected = webrtcHasFrames || (mjpegMode && snapshotReady);

	useEffect(() => {
		if (webrtcHasFrames) {
			setMjpegMode(false);
		} else if (!mjpegMode) {
			setMjpegMode(true);
		}
	}, [webrtcHasFrames, mjpegMode]);

	const candidates = useMemo(() => SNAPSHOT_CANDIDATES(videoState.url), [videoState.url]);

	useEffect(() => {
		if (!mjpegMode) {
			return;
		}
		setSnapshotReady(false);
		setCandidateIdx(0);
		setFrameToken(0);
		inFlightRef.current = false;
	}, [mjpegMode, videoState.url]);

	const snapshotUrl = useMemo(() => {
		if (!mjpegMode) {
			return null;
		}
		const base = candidates[Math.min(candidateIdx, candidates.length - 1)];
		return `${base}${base.includes('?') ? '&' : '?'}t=${frameToken || Date.now()}`;
	}, [mjpegMode, candidates, candidateIdx, frameToken]);

	// Poll fresh JPEGs. Skip ticks while a request is in-flight so a slow camera
	// cannot queue overlapping loads and stall the browser decoder.
	useEffect(() => {
		if (!mjpegMode) {
			return;
		}
		const tick = () => {
			if (inFlightRef.current) {
				// If a single JPEG hangs >2s, abort and try the next URL / reconnect.
				if (Date.now() - lastFrameAtRef.current > 2000) {
					inFlightRef.current = false;
					setCandidateIdx((i) => (i + 1 < candidates.length ? i + 1 : 0));
					setFrameToken(Date.now());
				}
				return;
			}
			inFlightRef.current = true;
			setFrameToken(Date.now());
		};
		tick();
		const id = window.setInterval(tick, SNAPSHOT_INTERVAL_MS);
		return () => window.clearInterval(id);
	}, [mjpegMode, candidates.length]);

	const onSnapshotLoad = useCallback(
		(e: React.SyntheticEvent<HTMLImageElement>) => {
			const img = e.currentTarget;
			inFlightRef.current = false;
			lastFrameAtRef.current = Date.now();
			if (img.naturalWidth > 0 && img.naturalHeight > 0) {
				setSnapshotReady(true);
				videoState.onStreamStats({
					framesPerSecond: 1000 / SNAPSHOT_INTERVAL_MS,
					frameWidth: img.naturalWidth,
					frameHeight: img.naturalHeight,
				} as RTCInboundRtpStreamStats);
			}
		},
		[videoState],
	);

	const onSnapshotError = useCallback(() => {
		inFlightRef.current = false;
		setSnapshotReady(false);
		setCandidateIdx((i) => (i + 1 < candidates.length ? i + 1 : 0));
		setFrameToken(Date.now());
	}, [candidates.length]);

	useEffect(() => {
		if (mjpegMode && imgRef.current) {
			const img = imgRef.current as HTMLImageElement & { videoWidth?: number; videoHeight?: number };
			img.videoWidth = img.naturalWidth || img.videoWidth || 0;
			img.videoHeight = img.naturalHeight || img.videoHeight || 0;
			gestureMediaRef.current = img as unknown as HTMLVideoElement;
		} else if (videoRef.current) {
			gestureMediaRef.current = videoRef.current;
		}
	}, [mjpegMode, snapshotUrl, snapshotReady, videoRef, webrtcHasFrames]);

	const [settings, setSettings, settingsQuery] = useMoonrakerState('Ratical', 'camera-settings', initialCameraSettings);
	const uiState = useUIState();
	const spatialMapping = useSpatialMapping({
		settings,
		containerRef: uiState.containerRef,
		videoRef: gestureMediaRef,
		windowSize: uiState.windowSize,
		zoom: uiState.zoom,
	});
	const gestureState = useGestures({
		setZoom: uiState.setZoom,
		canMove: uiState.canMove,
		gestureRef: gestureMediaRef,
		isConnected,
		toMillimeters: spatialMapping.toMillimeters,
		toScreen: spatialMapping.toScreen,
		zoom: uiState.zoom,
	});

	const videoScaleX = uiState.zoom * (settings?.flipHorizontal ? -1 : 1);
	const videoScaleY = uiState.zoom * (settings?.flipVertical ? -1 : 1);
	const videoTranslationX = gestureState.scaledDragOffset.x * (settings?.flipHorizontal ? -1 : 1);
	const videoTranslationY = gestureState.scaledDragOffset.y * (settings?.flipVertical ? -1 : 1);

	const mediaStyle: React.CSSProperties = {
		transform: `scale3d(${videoScaleX}, ${videoScaleY}, 1) translate3d(${videoTranslationX}px, ${videoTranslationY}px, 0)`,
	};
	const mediaClass = twMerge(
		'h-full max-h-full w-full min-w-full max-w-full transform-gpu touch-none object-contain',
		uiState.canMove && 'cursor-move',
		!gestureState.isDragging && 'transition-transform ease-in-out',
	);

	const showFailure =
		!mjpegMode &&
		!webrtcHasFrames &&
		connectionState === 'failed' &&
		!snapshotReady &&
		videoState.aspectRatio == null;
	const showSpinner = !isConnected && !showFailure;

	return (
		<div
			className={twJoin(
				uiState.isFullscreened ? 'h-full' : 'h-[calc(100vh_-_64px)]',
				'flex w-full select-none items-center',
			)}
			ref={uiState.rootRef}
		>
			<div
				className="relative mx-auto flex h-full max-h-full min-h-[50vh] min-w-[50vw] max-w-fit items-center overflow-hidden object-contain shadow-lg"
				ref={uiState.containerRef}
			>
				<video
					ref={videoRef}
					className={twMerge(mediaClass, mjpegMode && 'hidden')}
					style={mediaStyle}
					autoPlay
					muted
					playsInline
				/>
				{mjpegMode && (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						ref={imgRef}
						src={snapshotUrl ?? undefined}
						alt="VAOC camera"
						className={mediaClass}
						style={mediaStyle}
						onLoad={onSnapshotLoad}
						onError={onSnapshotError}
						draggable={false}
					/>
				)}
				<FillVideoFrame
					videoAspectRatio={videoState.aspectRatio ?? 0}
					containerAspectRatio={uiState.containerAspectRatio}
					zoom={uiState.zoom}
				>
					<SafetyVisualization gestureState={gestureState} />
				</FillVideoFrame>
				<CrossHair
					isConnected={isConnected && videoState.aspectRatio != null}
					isLockingCoordinates={uiState.isLockingCoordinates}
					settings={settings}
					toScreen={spatialMapping.toScreen}
					containerSize={spatialMapping.containerSize}
				/>
				<FillViewport>
					<h3
						className={twMerge(
							'absolute inset-0 flex items-center justify-center text-xl font-semibold text-rose-500 transition-all dark:text-rose-500',
							showFailure ? 'animate-pulse opacity-100' : 'opacity-0',
						)}
					>
						<div className="flex aspect-square h-[30svh] w-[30svh] items-center justify-center">
							Webcam stream not found
						</div>
					</h3>
					<Spinner
						noMargin={true}
						strokeWidth={1}
						className={twMerge(
							'h-[40svh] w-[40svh] animate-spin text-inherit transition-all',
							'text-lime-500 dark:text-lime-500',
							!showSpinner && 'opacity-0',
							connectionState === 'connecting' && 'text-brand-500 dark:text-brand-500',
						)}
					/>
				</FillViewport>
				<FillVideoFrame
					videoAspectRatio={videoState.aspectRatio ?? 0}
					containerAspectRatio={uiState.containerAspectRatio}
					zoom={uiState.zoom}
					className={twJoin(videoState.aspectRatio != null ? 'opacity-100' : 'opacity-0')}
				>
					<Toolbars
						zoom={uiState.zoom}
						toggleFullscreen={screenfull.isEnabled ? uiState.toggleFullscreen : null}
						isFullscreened={uiState.isFullscreened}
						setZoom={uiState.setZoom}
						setIsLockingCoordinates={uiState.setIsLockingCoordinates}
						setCanMove={uiState.setCanMove}
						canMove={uiState.canMove}
						fps={videoState.fps ?? 0}
						isConnected={isConnected}
						isLockingCoordinates={uiState.isLockingCoordinates}
						url={videoState.url}
						setSettings={setSettings}
						settings={settings}
						isSettingsFetched={settingsQuery.isFetched}
					/>
				</FillVideoFrame>
			</div>
		</div>
	);
};
