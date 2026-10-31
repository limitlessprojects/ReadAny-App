# Demo video script (about 2:30)

Record on a laptop browser (web app). If you have no Cerebras credits, skip the Cerebras-key steps (1:20 and the live badge at 1:45) and run the same flow on the free Gemini tier: say plainly that your Cerebras credits ran out, that BYOK is built and works, and show the TTFT/tok/s badge on the Gemini answer. Don't present Gemini numbers as Cerebras numbers.

| Time | Show | Say |
|---|---|---|
| 0:00 | Landing page, then `/demo.html` | "ReadAny lets you chat with your books. This is my entry for the Cerebras hackathon." |
| 0:15 | Landing page "Built with Cerebras" section | "**I used Cerebras Llama 3.3 to build the provider integration and test the API.** My credits ran out, so I added bring-your-own-key." |
| 0:35 | `/demo.html`: click the summary chip, then the Swahili chip | "No key needed here. Saved answers stream in, in English and Swahili." |
| 1:00 | Open `/app/`, import a short PDF or EPUB | "Now the real app. Books stay in the browser." |
| 1:20 | Settings → AI → Add Endpoint → Cerebras → paste key → pick model | "**Here I connect my own Cerebras key and pick the model.**" |
| 1:45 | Ask: "Summarize this chapter." Point at the badge | "**Live from Cerebras: first token in X ms, Y tokens per second.**" (read the real numbers off the badge) |
| 2:10 | Ask a follow-up, then tap read-aloud | "Answers are grounded in the book, and it reads aloud." |
| 2:25 | README "Built with Cerebras" | "Everything is open source. Links are in the description." |

Optional, only with a funded key: run `CEREBRAS_API_KEY=... node scripts/generate-demo-cache.mjs`, commit and push so `/demo.html` shows real recorded Cerebras numbers. Without it the page honestly says "sample response".
