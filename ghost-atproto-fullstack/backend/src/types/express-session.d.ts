import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

// Fix for express-session middleware type compatibility
declare module 'express' {
  interface Request {
    session: import('express-session').Session & Partial<import('express-session').SessionData>;
  }
}