export interface Logger {
    debug: (...args: any[]) => void;
    warn: (...args: any[]) => void;
}

let currentLogger: Logger = {
    debug: (...args: any[]) => console.debug(...args),
    warn: (...args: any[]) => console.warn(...args),
};

export function setLogger(logger: Logger) {
    currentLogger = logger;
}

export function getLogger(): Logger {
    return currentLogger;
}

export function debug(message: string, ...args: any[]) {
    currentLogger.debug(message, ...args);
}

export function warn(message: string, ...args: any[]) {
    currentLogger.warn(message, ...args);
}
