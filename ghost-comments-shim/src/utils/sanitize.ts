/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Validate and sanitize a URL to ensure it's safe
 */
export function sanitizeUrl(url: string): string {
  // Only allow http and https protocols
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Invalid protocol');
    }
    return url;
  } catch {
    throw new Error('Invalid URL');
  }
}

/**
 * Build the comment HTML with sanitized content
 */
export function buildCommentHtml(params: {
  bskyHandle: string;
  bskyProfileUrl: string;
  commentText: string;
  bskyPostUrl: string;
}): string {
  const { bskyHandle, bskyProfileUrl, commentText, bskyPostUrl } = params;

  // Validate and sanitize URLs
  const safeProfileUrl = sanitizeUrl(bskyProfileUrl);
  const safePostUrl = sanitizeUrl(bskyPostUrl);

  // Escape user-provided text
  const safeHandle = escapeHtml(bskyHandle);
  const safeText = escapeHtml(commentText);

  // Build HTML with inline styles (no custom classes for theme compatibility)
  return `<p><a href="${safeProfileUrl}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none;"><strong>@${safeHandle}</strong></a></p>
<p>${safeText}</p>
<p style="font-size:0.85em;opacity:0.7;"><a href="${safePostUrl}" target="_blank" rel="noopener noreferrer">View on Bluesky ↗</a></p>`;
}
