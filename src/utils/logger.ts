import chalk from 'chalk';

interface Logger {
  success: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
}

export const logger: Logger = {
  success: (message, ...args) => {
    console.log(`${chalk.green.bold('✔ SUCCESS:')} ${message}`, ...args);
  },
  error: (message, ...args) => {
    console.error(`${chalk.red.bold('✖ ERROR:')}  ${message}`, ...args);
  },
  warn: (message, ...args) => {
    console.warn(`${chalk.yellow.bold('⚠ WARN:')}   ${message}`, ...args);
  },
  info: (message, ...args) => {
    console.log(`${chalk.blue.bold('ℹ INFO:')}    ${message}`, ...args);
  }
};