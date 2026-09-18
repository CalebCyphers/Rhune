// Helpers for rendering long text inside Discord embeds.
// Discord truncates a field value at 1024 chars and a description at 4096,
// silently cutting off content (Bug #3). We split long text across multiple
// embed pages (≤4096 chars of description per page) so nothing is lost.

const DESC_LIMIT = 4096;

// Discord caps a message at 10 embeds. When paginating, keep it to a sane
// max and let the reader use the standalone reference (/moves) for the rest.
const MAX_PAGES = 10;

/**
 * Split a string into chunks that each fit comfortably inside an embed
 * description (4096-char limit). Tries to break on newlines when possible.
 *
 * @param {string} text
 * @param {{limit?: number}} [opts]
 * @returns {string[]}
 */
function splitIntoChunks(text, { limit = DESC_LIMIT } = {}) {
	if (!text) return [''];
	if (text.length <= limit) return [text];

	const chunks = [];
	let remainder = text;

	while (remainder.length > limit) {
		// Find the last newline inside the window, else hard-cut.
		let cut = remainder.lastIndexOf('\n', limit);
		if (cut < Math.floor(limit * 0.5)) cut = limit;

		chunks.push(remainder.slice(0, cut));
		remainder = remainder.slice(cut).replace(/^\n+/, '');
	}

	if (remainder) chunks.push(remainder);

	// Guard against exceeding Discord's 10-embeds-per-message cap.
	if (chunks.length > MAX_PAGES) {
		chunks.length = MAX_PAGES;
		const last = chunks[MAX_PAGES - 1];
		const suffix = '\n\n_… (more in the reference: use `/moves` to read the rest)_';
		chunks[MAX_PAGES - 1] = last.length + suffix.length > limit
			? last.slice(0, limit - suffix.length) + suffix
			: last + suffix;
	}

	return chunks;
}

/**
 * Tag each page's footer when an embed's description is split across pages,
 * so the reader knows there's more. Returns whether the text was paginated.
 *
 * @param {object} embed Discord embed with setFooter
 * @param {string} baseFooter
 * @param {number} pageIndex 0-based
 * @param {number} pageCount
 * @param {string} [label]
 */
function tagPagination(embed, baseFooter, pageIndex, pageCount, label = 'continued') {
	if (pageCount <= 1) {
		embed.setFooter({ text: baseFooter });
		return false;
	}
	const pageNo = pageIndex + 1;
	const suffix = pageNo < pageCount
		? ` • (${label} — p.${pageNo}/${pageCount})`
		: ` • (p.${pageNo}/${pageCount})`;
	embed.setFooter({ text: `${baseFooter}${suffix}` });
	return true;
}

module.exports = { splitIntoChunks, tagPagination, DESC_LIMIT };
