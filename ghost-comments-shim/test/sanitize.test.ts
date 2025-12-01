import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeUrl, buildCommentHtml } from '../src/utils/sanitize';

describe('sanitize', () => {
  it('should=((escapeHtml, basic))', () => {
    expect(escapeHtml('Hello <script>alert("xss")</script>')).toBe(
      'Hello &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('should=((escapeHtml, all-chars))', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('should=((sanitizeUrl, valid-https))', () => {
    expect(sanitizeUrl('https://bsky.app/profile/alice')).toBe('https://bsky.app/profile/alice');
  });

  it('should=((sanitizeUrl, valid-http))', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('should=((sanitizeUrl, invalid-protocol))', () => {
    expect(() => sanitizeUrl('javascript:alert(1)')).toThrow('Invalid protocol');
    expect(() => sanitizeUrl('data:text/html,<script>alert(1)</script>')).toThrow('Invalid protocol');
  });

  it('should=((sanitizeUrl, invalid-format))', () => {
    expect(() => sanitizeUrl('not-a-url')).toThrow('Invalid URL');
  });

  it('should=((buildCommentHtml, sanitized))', () => {
    const html = buildCommentHtml({
      bskyHandle: 'alice.bsky.social',
      bskyProfileUrl: 'https://bsky.app/profile/alice.bsky.social',
      commentText: 'Great post!',
      bskyPostUrl: 'https://bsky.app/profile/alice.bsky.social/post/abc123',
    });

    expect(html).toContain('@alice.bsky.social');
    expect(html).toContain('Great post!');
    expect(html).toContain('View on Bluesky ↗');
  });

  it('should=((buildCommentHtml, xss-escaped))', () => {
    const html = buildCommentHtml({
      bskyHandle: 'alice<script>',
      bskyProfileUrl: 'https://bsky.app/profile/alice',
      commentText: '<img src=x onerror=alert(1)>',
      bskyPostUrl: 'https://bsky.app/profile/alice/post/123',
    });

    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
  });
});
