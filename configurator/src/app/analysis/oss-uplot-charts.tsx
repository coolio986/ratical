'use client';

import React, { useEffect, useRef } from 'react';
import uPlot, { AlignedData, Options } from 'uplot';
import 'uplot/dist/uPlot.min.css';

/** Live accelerometer window length. */
export const SIGNAL_FIFO = 128;

const darkAxis = {
	stroke: '#a1a1aa',
	grid: { stroke: '#3f3f46', width: 1 },
	ticks: { stroke: '#52525b', width: 1 },
};

type SignalChartProps = {
	label: string;
	color: string;
	/** Called once with a setter that accepts aligned [t, y] samples */
	register: (setData: (t: Float64Array | number[], y: Float64Array | number[]) => void) => void;
	className?: string;
};

/**
 * Live accelerometer strip. Uses a fixed-size FIFO
 * and index-based X so the window stays readable. Seeds with zeros so the chart
 * is never a blank black box before streaming starts.
 */
export const UPlotSignalChart: React.FC<SignalChartProps> = ({ label, color, register, className }) => {
	const rootRef = useRef<HTMLDivElement>(null);
	const plotRef = useRef<uPlot | null>(null);
	const yBuf = useRef<number[]>(Array(SIGNAL_FIFO).fill(0));

	useEffect(() => {
		const el = rootRef.current;
		if (!el) {
			return;
		}

		const readSize = () => {
			// Cap height to the laid-out box — never follow an unbounded flex child
			// (that caused a ResizeObserver feedback loop → 30k+ px canvases).
			const width = Math.max(el.clientWidth || el.parentElement?.clientWidth || 300, 120);
			const height = Math.max(Math.min(el.clientHeight || 200, 400), 80);
			return { width, height };
		};

		const xs = Array.from({ length: SIGNAL_FIFO }, (_, i) => i);
		const opts: Options = {
			...readSize(),
			legend: { show: false },
			cursor: { show: false },
			scales: {
				x: { time: false, auto: false, range: [0, SIGNAL_FIFO - 1] },
				y: { auto: false, range: [-5000, 5000] },
			},
			axes: [
				{ ...darkAxis, show: false },
				{
					...darkAxis,
					size: 44,
					values: (_u, vals) => vals.map((v) => v.toFixed(0)),
				},
			],
			series: [{}, { label, stroke: color, width: 1.5, spanGaps: false }],
		};

		const plot = new uPlot(opts, [xs, yBuf.current.slice()] as AlignedData, el);
		plotRef.current = plot;

		const ro = new ResizeObserver(() => {
			if (!rootRef.current || !plotRef.current) {
				return;
			}
			plotRef.current.setSize(readSize());
		});
		ro.observe(el);
		if (el.parentElement) {
			ro.observe(el.parentElement);
		}

		register((t, y) => {
			const plot = plotRef.current;
			if (!plot) {
				return;
			}
			if (t.length === 0) {
				yBuf.current = Array(SIGNAL_FIFO).fill(0);
				plot.setData([xs, yBuf.current.slice()] as AlignedData);
				return;
			}
			const buf = yBuf.current;
			for (let i = 0; i < y.length; i++) {
				buf.push(Number(y[i]));
			}
			if (buf.length > SIGNAL_FIFO) {
				buf.splice(0, buf.length - SIGNAL_FIFO);
			}
			while (buf.length < SIGNAL_FIFO) {
				buf.unshift(0);
			}
			plot.setData([xs, buf.slice()] as AlignedData);
		});

		return () => {
			ro.disconnect();
			plot.destroy();
			plotRef.current = null;
			yBuf.current = Array(SIGNAL_FIFO).fill(0);
		};
	}, [color, label, register]);

	return <div ref={rootRef} className={className ?? 'h-full w-full'} style={{ minHeight: 120 }} />;
};

type PSDChartProps = {
	register: (
		setData: (series: { freq: number[]; x: number[]; y: number[]; z: number[]; total: number[] }) => void,
	) => void;
	className?: string;
};

export type UPlotPSDSeries = {
	label: string;
	color: string;
	frequencies: number[];
	estimates: number[];
	width?: number;
};

type StaticPSDChartProps = {
	series: UPlotPSDSeries[];
	className?: string;
};

const getPlotSize = (el: HTMLDivElement) => ({
	width: Math.max(el.clientWidth || el.parentElement?.clientWidth || 600, 200),
	height: Math.max(Math.min(el.clientHeight || el.parentElement?.clientHeight || 320, 520), 200),
});

/**
 * Static multi-series PSD view for recorded macro runs. uPlot requires aligned
 * data, so individual series retain only the frequency points shared by the
 * first series; recorded PSDs normally use the same frequency bins.
 */
export const UPlotStaticPSDChart: React.FC<StaticPSDChartProps> = ({ series, className }) => {
	const rootRef = useRef<HTMLDivElement>(null);
	const plotRef = useRef<uPlot | null>(null);

	useEffect(() => {
		const el = rootRef.current;
		if (!el) return;
		const readSize = () => getPlotSize(el);
		const xs = series[0]?.frequencies ?? [0, 200];
		const aligned = [
			xs,
			...series.map((item) => xs.map((frequency) => item.estimates[item.frequencies.indexOf(frequency)] ?? null)),
		] as AlignedData;
		const plot = new uPlot(
			{
				...readSize(),
				legend: { show: true },
				cursor: { show: true },
				scales: { x: { time: false }, y: { auto: true } },
				axes: [
					{ ...darkAxis, label: 'Hz', values: (_u, vals) => vals.map((v) => v.toFixed(0)) },
					{
						...darkAxis,
						label: 'Power',
						size: 50,
						values: (_u, vals) => vals.map((v) => (Math.abs(v) >= 1000 ? v.toExponential(1) : v.toFixed(2))),
					},
				],
				series: [{}, ...series.map((item) => ({ label: item.label, stroke: item.color, width: item.width ?? 2 }))],
			},
			aligned,
			el,
		);
		plotRef.current = plot;
		const ro = new ResizeObserver(() => plotRef.current?.setSize(readSize()));
		ro.observe(el);
		if (el.parentElement) ro.observe(el.parentElement);
		return () => {
			ro.disconnect();
			plot.destroy();
			plotRef.current = null;
		};
	}, [series]);

	return <div ref={rootRef} className={className ?? 'h-full w-full'} style={{ minHeight: 256, height: '100%' }} />;
};

export const UPlotPSDChart: React.FC<PSDChartProps> = ({ register, className }) => {
	const rootRef = useRef<HTMLDivElement>(null);
	const plotRef = useRef<uPlot | null>(null);

	useEffect(() => {
		const el = rootRef.current;
		if (!el) {
			return;
		}

		const readSize = () => {
			const width = Math.max(el.clientWidth || el.parentElement?.clientWidth || 600, 200);
			// Hard cap — parent is flex-1; without a cap ResizeObserver grows forever.
			const raw = el.clientHeight || el.parentElement?.clientHeight || 320;
			const height = Math.max(Math.min(raw > 2000 ? 320 : raw, 520), 200);
			return { width, height };
		};

		const opts: Options = {
			...readSize(),
			legend: { show: true },
			cursor: { show: true },
			scales: {
				x: { time: false },
				y: { auto: true },
			},
			axes: [
				{
					...darkAxis,
					label: 'Hz',
					values: (_u, vals) => vals.map((v) => v.toFixed(0)),
				},
				{
					...darkAxis,
					label: 'Power',
					size: 50,
					values: (_u, vals) => vals.map((v) => (Math.abs(v) >= 1000 ? v.toExponential(1) : v.toFixed(2))),
				},
			],
			series: [
				{},
				{ label: 'X', stroke: '#facc15', width: 1.5 },
				{ label: 'Y', stroke: '#38bdf8', width: 1.5 },
				{ label: 'Z', stroke: '#fb7185', width: 1.5 },
				{
					label: 'Total',
					stroke: '#a3e635',
					fill: 'rgba(163, 230, 53, 0.15)',
					width: 2,
				},
			],
		};

		const emptyFreq = Array.from({ length: 64 }, (_, i) => i * (200 / 63));
		const zeros = emptyFreq.map(() => 0);
		const plot = new uPlot(opts, [emptyFreq, zeros, zeros, zeros, zeros] as AlignedData, el);
		plotRef.current = plot;

		const ro = new ResizeObserver(() => {
			if (!rootRef.current || !plotRef.current) {
				return;
			}
			plotRef.current.setSize(readSize());
		});
		ro.observe(el);
		if (el.parentElement) {
			ro.observe(el.parentElement);
		}

		register((series) => {
			if (!series.freq.length) {
				plotRef.current?.setData([emptyFreq, zeros, zeros, zeros, zeros] as AlignedData);
				return;
			}
			plotRef.current?.setData([series.freq, series.x, series.y, series.z, series.total] as AlignedData);
		});

		return () => {
			ro.disconnect();
			plot.destroy();
			plotRef.current = null;
		};
	}, [register]);

	return (
		<div
			ref={rootRef}
			className={className ?? 'h-full w-full'}
			style={{ minHeight: 256, maxHeight: 520, height: '100%' }}
		/>
	);
};
