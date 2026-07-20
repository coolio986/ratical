/** stream-utils.ts — Part of the /configure/analysis (input-shaper / resonance) UI, charted with uPlot. See docs/ARCHITECTURE.md §4. */
import { scan, pipe, filter, Observable, UnaryFunction } from 'rxjs';

export const bufferFifo = <T>(bufferSize: number): UnaryFunction<Observable<T>, Observable<T[]>> =>
	pipe(
		scan((acc, input: T) => {
			const buffer = [...acc, input].slice(-bufferSize);
			return buffer;
		}, [] as T[]),
		filter((buffer) => buffer.length >= bufferSize),
	);
