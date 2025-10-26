'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const [handle, setHandle] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    // Google OAuth login
    const handleGoogleLogin = () => {
        window.location.href = '/api/auth/google';
    };

    // ATProto OAuth login
    const handleATProtoLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!handle) {
            setError('Please enter your Bluesky handle');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/atproto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ handle })
            });

            const data = await response.json();

            if (data.authUrl) {
                // Redirect to ATProto OAuth
                window.location.href = data.authUrl;
            } else {
                setError(data.error || 'Failed to initiate login');
            }
        } catch (err) {
            setError('Failed to connect to server');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
                <div>
                    <h2 className="text-3xl font-bold text-center">Sign In</h2>
                    <p className="mt-2 text-center text-gray-600">
                        Choose your preferred login method
                    </p>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                        {error}
                    </div>
                )}

                <div className="space-y-6">
                    {/* Google OAuth */}
                    <button
                        onClick={handleGoogleLogin}
                        className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Continue with Google
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300" />
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white text-gray-500">Or</span>
                        </div>
                    </div>

                    {/* ATProto OAuth */}
                    <form onSubmit={handleATProtoLogin} className="space-y-4">
                        <div>
                            <label htmlFor="handle" className="block text-sm font-medium text-gray-700">
                                Bluesky Handle
                            </label>
                            <input
                                id="handle"
                                type="text"
                                value={handle}
                                onChange={(e) => setHandle(e.target.value)}
                                placeholder="yourhandle.bsky.social"
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                disabled={loading}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.89 6.27c.31.31.53.68.65 1.08.13.4.18.83.18 1.27 0 .44-.05.87-.18 1.27-.12.41-.34.77-.65 1.08l-2.14 2.14c-.31.31-.68.53-1.08.65-.4.13-.83.18-1.27.18-.44 0-.87-.05-1.27-.18-.41-.12-.77-.34-1.08-.65l-2.14-2.14c-.31-.31-.53-.68-.65-1.08-.13-.4-.18-.83-.18-1.27 0-.44.05-.87.18-1.27.12-.41.34-.77.65-1.08l2.14-2.14c.31-.31.68-.53 1.08-.65.4-.13.83-.18 1.27-.18.44 0 .87.05 1.27.18.41.12.77.34 1.08.65l2.14 2.14z"/>
                            </svg>
                            {loading ? 'Connecting...' : 'Continue with Bluesky'}
                        </button>
                    </form>
                </div>

                <p className="text-xs text-center text-gray-500">
                    By signing in, you agree to our Terms of Service and Privacy Policy
                </p>
            </div>
        </div>
    );
}
