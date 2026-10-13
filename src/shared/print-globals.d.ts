export {};
declare global {
  interface Window {
    __PRINT_READY__?: boolean;
    __MISSING_ASSETS__?: string[];
    __PRINT_ERROR__?: string;
    __FONTS__?: string[];
    __MISSING_FONTS__?: string[];
  }
}
