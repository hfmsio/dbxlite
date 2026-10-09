/**
 * Offline stand-in for the host's AI endpoint, used by `pnpm dev`.
 *
 * Without it the first message in local dev is a real, billed call against a
 * visitor's credits. It streams in real time on purpose so the "thinking"
 * states are exercised rather than skipped.
 */

import { createMockStream } from "@zibby-run/app-kit/mock";

const CANNED_SQL = `Here is a query for that:

\`\`\`sql
SELECT category, count(*) AS n
FROM sales
GROUP BY category
ORDER BY n DESC
LIMIT 10;
\`\`\`

It groups the rows by category and shows the ten largest.`;

export const mockStreamZibbyAi = createMockStream({
	cannedAnswer: () => CANNED_SQL,
	quoteFor: () => 3,
});
