'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function EmailCollection() {
    const [email, setEmail] = useState('');
    const [subscribe, setSubscribe] = useState(true);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        
        try {
            const response = await fetch('/api/auth/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, subscribe })
            });
            
            if (response.ok) {
                router.push('/dashboard');
            }
        } catch (error) {
            console.error('Failed to save email:', error);
        } finally {
            setLoading(false);
        }
    };
    
    const handleSkip = async () => {
        setLoading(true);
        try {
            await fetch('/api/auth/skip-email', { method: 'POST' });
            router.push('/dashboard');
        } catch (error) {
            console.error('Failed to skip:', error);
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
                <div>
                    <h2 className="text-3xl font-bold text-center">Welcome! 👋</h2>
                    <p className="mt-2 text-center text-gray-600">
                        You're logged in with Bluesky. Want to get our newsletter?
                    </p>
                </div>
                
                <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                            Email address (optional)
                        </label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="you@example.com"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            We'll only use this for newsletter updates, never spam
                        </p>
                    </div>
                    
                    <div className="flex items-center">
                        <input
                            id="subscribe"
                            name="subscribe"
                            type="checkbox"
                            checked={subscribe}
                            onChange={(e) => setSubscribe(e.target.checked)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="subscribe" className="ml-2 block text-sm text-gray-900">
                            Yes, send me newsletter updates
                        </label>
                    </div>
                    
                    <div className="space-y-3">
                        <button
                            type="submit"
                            disabled={loading || !email}
                            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Saving...' : 'Continue'}
                        </button>
                        
                        <button
                            type="button"
                            onClick={handleSkip}
                            disabled={loading}
                            className="w-full py-2 px-4 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
                        >
                            Skip for now
                        </button>
                    </div>
                </form>
                
                <p className="text-xs text-center text-gray-500">
                    You can always subscribe later from your profile settings
                </p>
            </div>
        </div>
    );
}
