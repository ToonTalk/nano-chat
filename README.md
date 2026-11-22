# Nano Chat

A chatbot that runs entirely on **Gemini Nano**, the small language model built into Chrome.
No account, no API key, and no other language model. Your conversations stay in your browser.

**Try it:** https://toontalk.github.io/nano-chat/

![Nano Chat answering with a calculator and a Wikipedia search](screenshots/search.png)

## What you need

- Chrome 148 or newer on a Windows, Mac or Linux computer, or a Chromebook Plus.
- About 22 GB of free disk space, and either a graphics card with more than 4 GB of memory
  or 16 GB of RAM.
- The first visit downloads the model (a few gigabytes), once for all sites.

Phones and tablets are not supported by Chrome's built-in model yet.

## Working around a small model

Gemini Nano can hold only about 9,000 tokens at once and has no tool calling of its own.
Nano Chat does these jobs in the page instead.

| Limit | What the page does |
| --- | --- |
| Small context window | The page keeps the whole transcript. Nano sees its instructions, your notes, a **contents list** of the older parts, and the recent messages. |
| Forgetting older messages | When the window fills, a side session writes a contents entry (title, topics, gist) for the oldest stretch. To look back, Nano picks a contents entry, or the page searches the transcript by keyword, or both (a setting). |
| No tool calling | A separate small session chooses a tool as JSON. The page runs the tool and hands Nano the result along with your message. |
| Weak arithmetic | A real calculator in the page, with percentages and date math. Plain arithmetic never goes to the model at all. |
| No knowledge of recent events | Web search: Wikipedia with no key, or Tavily or Serper with your own key. Answers cite their sources. |
| Long documents | A pasted link, a long paste or an attached text file is searched for the relevant passages, or summarized in parts by side sessions. |
| No memory between chats | Notes. Say "Remember that..." and it is saved in the browser and available in every chat. |

Click the **Memory** pill to see exactly what Nano can see at that moment, and click any tool
chip under a reply to see what the tool gave it.

![The contents list of a long conversation](screenshots/contents.png)

## Tools

| Tool | When it is used |
| --- | --- |
| Calculator | Arithmetic, percentages, powers, `sqrt` and friends, and dates: `daysBetween(today, 2026-12-25)`, `addDays`, `weekday`. |
| Web search | Facts about people, places, works, science and history, and anything recent. |
| Read a page | When your message contains a link. |
| Save a note / read a note | "Remember that...", and later questions about your own things. |
| Look back | Questions about earlier parts of a long conversation or an attached document. |

You can also ask for a tool yourself by starting a message with `/search`, `/calc`, `/note`
(save a note), `/read` (open a note) or `/recall` (look back).

## Be aware

Gemini Nano is a small model. It can state wrong things with confidence, even with a search
result in front of it, and it sometimes does sums in its head instead of using the
calculator. Open the tool chips and the sources to check what an answer rests on.

## Where your data goes

- Conversations are stored in this browser (IndexedDB), notes and settings in local storage.
- A web search sends the search words to Wikipedia, or to Tavily or Serper if you add a key.
- Reading a link fetches that page. If the site refuses, the page is fetched through the
  `r.jina.ai` reader, which you can turn off in Settings.
- Nothing else leaves your computer. Search keys are kept only in this browser.

## Files

- `index.html`: the whole app in one file, with no dependencies. It also works opened
  straight from disk.
- `tools/`: tests that drive a headless Chrome with the real Gemini Nano (Windows, Node 24).
  They copy the installed model into a throwaway profile, so your own Chrome profile is not
  touched.
  - `node tools/test.mjs quick`: calculator, tools, notes.
  - `node tools/test.mjs long`: a long conversation in a pretend 1,500-token window, to
    exercise the contents list and looking back.
  - `node tools/test-stop.mjs`: the Stop button.

Add `?window=1500` to the address to watch the contents list being written after only a few
messages.

## License

MIT
