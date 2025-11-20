import { EventEmitter } from 'node:events';

export const doorEventEmitter = new EventEmitter();

doorEventEmitter.setMaxListeners(0);
