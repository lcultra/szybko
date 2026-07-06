/* eslint-disable no-console */
import { blue, cyan, dim, green, red, yellow } from 'picocolors';

export function info(msg: string): void {
    console.log(cyan(`▸ ${msg}`));
}

export function success(msg: string): void {
    console.log(green(`✔ ${msg}`));
}

export function warn(msg: string): void {
    console.log(yellow(`⚠ ${msg}`));
}

export function error(msg: string): void {
    console.error(red(`✖ ${msg}`));
}

export function dimmed(msg: string): void {
    console.log(dim(msg));
}

export function highlight(msg: string): void {
    console.log(blue(msg));
}
