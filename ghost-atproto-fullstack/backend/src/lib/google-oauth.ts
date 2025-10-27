import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { PrismaClient } from '@prisma/client';
import { oauthConfig } from './oauth-config';

const prisma = new PrismaClient();

export function setupGoogleOAuth() {
  // Only setup if Google credentials are available
  if (!oauthConfig.google.clientId || !oauthConfig.google.clientSecret) {
    console.log('⚠️  Skipping Google OAuth setup - credentials not configured');
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: oauthConfig.google.clientId,
        clientSecret: oauthConfig.google.clientSecret,
        callbackURL: oauthConfig.google.callbackURL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Extract profile information
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value;
          const name = profile.displayName;
          const picture = profile.photos?.[0]?.value;

          if (!email) {
            return done(new Error('No email found in Google profile'));
          }

          // Check if user exists with this email
          let user = await prisma.user.findUnique({ where: { email } });

          if (!user) {
            // Create new user for Google OAuth
            user = await prisma.user.create({
              data: {
                email,
                name,
                role: 'USER',
              },
            });
          } else {
            // Update existing user's name if needed
            if (name && user.name !== name) {
              user = await prisma.user.update({
                where: { id: user.id },
                data: { name },
              });
            }
          }
          // let oauthAccount = await prisma.oAuthAccount.findUnique({
          //   where: {
          //     provider_providerId: {
          //       provider: 'google',
          //       providerId: googleId,
          //     },
          //   },
          //   include: { user: true },
          // });

          // let user;

          // if (oauthAccount) {
          //   // Update existing OAuth account
          //   oauthAccount = await prisma.oAuthAccount.update({
          //     where: { id: oauthAccount.id },
          //     data: {
          //       accessToken,
          //       refreshToken: refreshToken || undefined,
          //       email,
          //       name,
          //       picture,
          //     },
          //     include: { user: true },
          //   });
          //   user = oauthAccount.user;
          // } else {
          //   // Check if user exists with this email
          //   user = await prisma.user.findUnique({ where: { email } });

          //   if (user) {
          //     // Link Google account to existing user
          //     oauthAccount = await prisma.oAuthAccount.create({
          //       data: {
          //         userId: user.id,
          //         provider: 'google',
          //         providerId: googleId,
          //         email,
          //         name,
          //         picture,
          //         accessToken,
          //         refreshToken,
          //       },
          //       include: { user: true },
          //     });
          //   } else {
          //     // Create new user and link Google account
          //     user = await prisma.user.create({
          //       data: {
          //         email,
          //         name,
          //         role: 'USER',
          //         oauthAccounts: {
          //           create: {
          //             provider: 'google',
          //             providerId: googleId,
          //             email,
          //             name,
          //             picture,
          //             accessToken,
          //             refreshToken,
          //           },
          //         },

          return done(null, user);
        } catch (error) {
          console.error('Google OAuth error:', error);
          return done(error as Error);
        }
      }
    )
  );

  // Serialize user for session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  console.log('✅ Google OAuth configured');
}
