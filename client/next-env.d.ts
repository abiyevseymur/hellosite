/// <reference types="next" />
/// <reference types="next/types/global" />
/// <reference types="next/image-types/global" />

declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_API_URL?: string;
  }
}

export {};
