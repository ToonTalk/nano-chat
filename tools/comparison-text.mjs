// The words of older-models.html. The numbers come from build-comparison.mjs, which counts them from the records.
export function prose(n, t) {
  const { N, stat: S, above, J, f } = n, pct = (a, b) => `${a} of ${b}`;
  const top = `
<h1>Nano beside older models</h1>
<p class="lead">How does the small model in today’s Chrome compare with the models that came before it? On November 22, 2026, two experiments were run: Nano Chat on GPT-2 from 2019, and Gemini Nano answering 30 questions that the first ChatGPT answered in December 2022.</p>

<div class="note">Ken Kahn asked the question and chose where to look first. Claude (Anthropic’s Claude Fable 5.2, working in Claude Code on Ken’s computer) built the stand-in for GPT-2, ran both experiments and wrote this report from the records. The answers were judged blind by another Claude model (${n.judge}), and separately by Gemini Nano itself.</div>

<h2>In short</h2>
<ul>
<li><b>GPT-2 runs in the page, and cannot be made into a chatbot by it.</b> It answered the same 30 questions twice, with every part off and with every part on. The judge gave 59 of the 60 answers the lowest score for correctness, and all 60 the lowest for helpfulness.</li>
<li><b>The first ChatGPT and bare Gemini Nano came out about level.</b> On a scale of 1 to 5 the judge gave ChatGPT’s recorded answers ${f(S.gpt35.correct)} for correctness and Nano’s ${f(S.bare.correct)}, and ranked Nano’s answer above ChatGPT’s on ${N - above('gpt35', 'bare')} of ${N} questions. With this few questions that could be chance.</li>
<li><b>Switching every part on did not make Nano better on these questions.</b> Web search helped with plain facts and got in the way of explanations and advice.</li>
<li><b>Nano is not a fair judge of itself.</b> Shown ChatGPT’s answer beside its own bare answer, unlabeled, it preferred its own ${J.bare.n} times out of ${J.bare.n + J.bare.g + J.bare.same + J.bare.flip} and ChatGPT’s ${J.bare.g === 0 ? 'never' : J.bare.g + ' times'}.</li>
</ul>
<p>The sample is small and there was one judge, so read the numbers as a first look. <a href="#limits">What this does not show</a> is set out below, before the examples.</p>

<h2>Which old models can still be run</h2>
<p>Ken’s first thought was GPT-3, GPT-3.5 or Claude 1. None of them can be run any more through the company that made it.</p>
<div class="scroll"><table>
<tr><th>Model</th><th>Released</th><th>Today</th></tr>
<tr><td>GPT-2</td><td>2019</td><td>The weights are public, so it can be run anywhere, including in a browser.</td></tr>
<tr><td>GPT-3 (davinci)</td><td>2020</td><td>Shut down in January 2024. Its successor <code>davinci-002</code> followed on September 28, 2026.</td></tr>
<tr><td>GPT-3.5, the model behind the first ChatGPT</td><td>2022</td><td>Its last version, GPT-3.5 Turbo, was shut down on October 23, 2026, a month before this was written.</td></tr>
<tr><td>Claude 1</td><td>2023</td><td>Retired on November 6, 2024.</td></tr>
</table></div>
<p>The dates are from <a href="https://developers.openai.com/api/docs/deprecations">OpenAI’s</a> and <a href="https://platform.claude.com/docs/en/about-claude/model-deprecations">Anthropic’s</a> lists of retired models. So there were two ways forward: run GPT-2, and use answers that GPT-3.5 gave while it was still running.</p>

<h2>Experiment 1: Nano Chat on GPT-2</h2>
<p>Nano Chat reaches Gemini Nano through a handful of calls: make a session, send it a message, copy it, add to it. For this experiment a separate file gave GPT-2 the same face, so that the rest of the page, every part included, ran unchanged on a model from 2019. Adding <code>?model=gpt2</code> to the address loaded it.</p>
<div class="note">That switch has since been taken out of Nano Chat, so GPT-2 can no longer be tried there. The file is in the project’s history on GitHub (<code>open-models.js</code>, as of 23 November 2026), and <a href="making-of.html#other-models">how it was made</a> says why it went.</div>
<p>One thing had to be added. GPT-2 was never trained to hold a conversation. It only continues text. So the stand-in lays each conversation out as a script, with lines starting “User:” and “Assistant:”, lets GPT-2 write on from “Assistant:”, and stops it when it begins a line for the user. Gemini Nano needs nothing like this, because conversation was part of its training.</p>
<h3>What was measured</h3>
<div class="scroll"><table>
<tr><th></th><th>GPT-2 small in the page</th><th>Gemini Nano in Chrome</th></tr>
<tr><td>Released</td><td>February 2019</td><td>Built into Chrome; the copy tested is labeled 2025.06.30</td></tr>
<tr><td>Size</td><td>124 million parameters, a 280 MB download</td><td>A few gigabytes</td></tr>
<tr><td>Memory</td><td>1,024 tokens, prompt and reply together</td><td>9,216 tokens</td></tr>
<tr><td>Speed</td><td>About 22 tokens a second for a short prompt, on the processor alone</td><td>Not measured here</td></tr>
<tr><td>First start</td><td>About 32 seconds, download included</td><td>About 17 seconds once downloaded</td></tr>
</table></div>
<p>This was GPT-2 <b>small</b>, the first and smallest of the four sizes OpenAI released in 2019. The largest has 1.5 billion parameters. The stand-in listed all four, but only the small one was tried.</p>
<h3>What happened</h3>
<ul>
<li><b>With every part off</b>, GPT-2 wrote text that sounds like talk and says nothing. Asked “when did freddie mercury die”, it replied “I’m going to be doing this.” Twice it repeated the question back.</li>
<li><b>With every part on, it never used a tool.</b> The page asks the model to choose a tool by writing a small piece of JSON. Chrome holds Gemini Nano to that shape. Nothing holds GPT-2 to it, and it never wrote a choice the page could use, so the page fell back to “no tool” every time. The instructions for choosing a tool are also about as long as GPT-2’s whole memory, so they were cut short on every question.</li>
<li><b>The instructions became material to copy.</b> In 6 of the 30 answers GPT-2 recited the page’s own instructions back: “You are a small model, so be honest: when you are not sure, say so instead of guessing”. In an earlier run, after the page’s calculator had answered one sum as <b>397.8</b>, GPT-2 answered five of the next six messages, a request for a poem among them, with a lone number in bold.</li>
<li><b>The parts made it slower, not better.</b> An answer took about ${f(S.gpt2.secs, 0)} seconds with the parts off and about ${f(S.gpt2full.secs, 0)} with them on, because every long prompt has to be read again from the start. (Both were timed while another test was using the same computer, so both are on the slow side.)</li>
</ul>
<p>The one thing that worked with the parts on was a sum the page’s calculator answered by itself, without asking the model. So for GPT-2 the answer to the app’s question, how much of a chatbot is the model and how much is everything around it, is that the parts need a model that can follow instructions before they can add anything.</p>
<h3>What went wrong on the way</h3>
<ul>
<li><b>A setting of mine made GPT-2 look worse than it is.</b> I first ran it with a “repetition penalty”, a usual setting for GPT-2. It counts every word already in the conversation, so as a conversation grew the replies turned into word salad. I took it out and ran everything again. Without it GPT-2 repeats itself instead, which is its own well-known habit.</li>
<li><b>The line under the message box still said “Gemini Nano”</b> after the first message. A screenshot showed it, and it is fixed.</li>
<li><b>GPT-2 found a bug in the page.</b> Twice it wrote a sentence inside quotation marks, which happens to be valid JSON, and the tool chooser crashed on it. Gemini Nano cannot do that, since Chrome holds it to the shape asked for. The page now checks.</li>
</ul>

<h2>Experiment 2: the first ChatGPT’s recorded answers</h2>
<p>GPT-3.5 cannot be asked anything new, but its old answers were kept. <a href="https://huggingface.co/datasets/Hello-SimpleAI/HC3">HC3</a>, the Human ChatGPT Comparison Corpus, holds about 24,000 questions with the answers ChatGPT gave in December 2022 and January 2023, a few weeks after it was released, each beside an answer a person wrote. A script drew 30 questions from it with a fixed random seed: 10 fact questions, 10 “explain like I’m five” questions from Reddit, 5 computing terms and 5 money questions.</p>
<p>Gemini Nano then answered each question twice in Nano Chat, in a fresh chat each time: as the bare model, and with every part on. GPT-2’s two answers from Experiment 1 were added. For each question the five answers were shuffled, labeled A to E, and given to ${n.judge} with the person’s answer for reference. It scored each from 1 to 5 for being correct and for being helpful, and ranked the five. It was told not to reward length or polish.</p>
<p>One of the 30 recordings turned out to be broken: where ChatGPT’s answer should be, the data set holds a copy of the ChatGPT screen. That question is shown among the examples and left out of every count, which leaves ${N}.</p>
<h3>The scores</h3>
${t.scoreTable}
<p>Head to head, by the judge’s ranking:</p>
<ul>
<li>Bare Nano was ranked above ChatGPT on ${pct(N - above('gpt35', 'bare'), N)} questions.</li>
<li>ChatGPT was ranked above Nano with all parts on ${pct(above('gpt35', 'full'), N)}.</li>
<li>Nano with all parts was ranked above bare Nano on ${pct(above('full', 'bare'), N)}.</li>
</ul>
<p>ChatGPT was a little more often correct and bare Nano a little more often helpful. Bare Nano’s answers were also three times as long. Eighteen wins out of 29 is the kind of split that chance alone produces about one time in four, so the fair reading is “about level”, not “Nano is better”.</p>
<h3>By kind of question (correctness)</h3>
${t.kindTable}
<h3>What the parts did</h3>
<p>With every part on, the page searched Wikipedia for ${n.searchCount('full')} of the 30 questions. For plain facts that helped: Nano with search was the most correct of all on the fact questions. Bare Nano had said that Operation Torch was an Axis operation and had given a college the wrong mascot, and search put both right.</p>
<p>For explanations and advice it mostly hurt. Asked about a broker’s fee when buying a home, the page found articles on dividend reinvestment plans and on Charles Schwab, and Nano declined to answer from them. Asked when the Germans entered Paris, it was handed the article “Nazi Germany” and answered “May 1945”. Bare Nano knows a good deal about these subjects, and an encyclopedia search that misses pushes that knowledge aside. The instructions also tell Nano to keep answers fairly short, and the judge rated the shorter answers less helpful.</p>
<p>This is a finding about these 30 questions, which were chosen because ChatGPT had answered them, not because they suit the parts. None of them needs arithmetic, a date, a note or a long memory.</p>
<h3>Nano as the judge</h3>
<p>Nano was also asked to judge. It saw ChatGPT’s answer and its own, unlabeled, and was asked which was better. Each pair was shown in both orders, so that a habit of picking the first one would show up as a change of mind.</p>
${t.judgeTable}
<p>Against its own long bare answers, Nano never once preferred ChatGPT. Where it gave the same verdict in both orders, it agreed with Claude on ${pct(J.bare.agree, J.bare.both)} of those pairs for the bare answers and ${pct(J.full.agree, J.full.both)} for the answers with all parts on. It cannot know which answer is its own, so a likely reading is that it prefers the longer and more thorough-looking answer. That was not tested.</p>
<h3>What went wrong on the way</h3>
<ul>
<li><b>My first instructions to the judge were unfair to Nano.</b> With search on, Nano marks its facts with numbers like [1] that link to the sources the page shows. The judge could not see the sources, and in 18 of 30 verdicts it complained of citation markers that pointed to nothing. I told it what the markers are and had it judge all 30 again. The averages moved by less than 0.1, so that was not what held Nano’s score down. The first verdicts are kept beside the second.</li>
<li><b>Two verdicts could not be read</b> the second time, because the judge’s reply was not valid JSON. Those two questions were judged once more.</li>
</ul>

<h2 id="limits">What this does not show</h2>
<ul>
<li><b>It is a small sample</b>: ${N} questions, each answered once. Nano answers differently each time it is asked.</li>
<li><b>There was one judge, and it is a language model.</b> No person checked its verdicts. It may favor writing that resembles its own, and it may have rewarded length in spite of being told not to.</li>
<li><b>Nano may have seen the test.</b> The questions come from Wikipedia, Reddit and a finance forum, and the data set with ChatGPT’s answers has been public since January 2023. All of that could be in Gemini Nano’s training. ChatGPT in 2022 could not have seen any answers written after it.</li>
<li><b>The recordings are taken on trust.</b> The data set says these are ChatGPT’s answers, and one in 30 was not an answer at all.</li>
<li><b>GPT-2 here means GPT-2 small</b>, run with one way of laying out the conversation. The larger sizes would write better sentences. Whether any of them could use the parts was not tried.</li>
<li><b>This is the first ChatGPT, not GPT-3.5 at its best.</b> The model was improved several times in 2023.</li>
</ul>`;

  const gpt2Intro = `<p>The same 30 questions, answered by GPT-2 small through Nano Chat. Open a question to see both answers. The two numbers on each line are the judge’s scores for correctness, from 1 to 5: first with every part off, then with every part on.</p>`;
  // The guides link straight to this section, so it has to make sense to a reader who has seen nothing above it.
  const chatIntro = `<p>The first ChatGPT came out in November 2022 and amazed people. Here are 30 questions it was asked in its first weeks, each with the answer it gave then and the answers Gemini Nano gives today: one from the bare model, and one with every part of Nano Chat switched on.</p>
<p><b>Open a question, read the three answers, and decide for yourself which is best.</b> Then open “What the judge said” beneath them. The judge was another AI, a Claude model, which was not told who wrote which answer. It gave each answer a score from 1 to 5 for being correct, another for being helpful, and a place among the answers. It can be wrong too. Below its verdicts is what Nano said when it was shown two of the answers, unlabeled, and asked which was better.</p>
<p>The judge also ranked two answers from a much older model, GPT-2, which are shown in <a href="#gpt2-examples">the section before this one</a>. That is why the places run to 5. <a href="#limits">What this comparison does not show</a> is worth reading before drawing conclusions from it.</p>`;
  const end = `
<h2>Running it again</h2>
<p>The part about ChatGPT and Nano can be repeated with the scripts in <code>tools/</code>. The scripts that ran GPT-2 went when the switch was removed, and are in the project’s history. They need Windows, Node 24 and Chrome with Gemini Nano installed, and the last needs a Claude key.</p>
<ul>
<li><code>node tools/recorded-fetch.mjs</code> draws the same 30 questions from HC3.</li>
<li><code>node tools/recorded-nano.mjs</code> has Gemini Nano answer them, then judge.</li>
<li><code>node tools/recorded-judge.mjs</code> has Claude judge. Both rounds of judging together used about ${Math.round((n.tokens.in + 62878) / 1000)},000 input tokens and ${Math.round((n.tokens.out + 12807) / 1000)},000 output tokens.</li>
<li><code>node tools/build-comparison.mjs</code> builds this page from the records.</li>
</ul>
<footer>The questions, ChatGPT’s answers and the people’s answers are from HC3: Guo et al., <a href="https://arxiv.org/abs/2301.07597">How Close is ChatGPT to Human Experts? Comparison Corpus, Evaluation, and Detection</a> (2023), shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. They are shown as recorded, apart from line breaks and accented letters that had been garbled. GPT-2 was run with <a href="https://huggingface.co/docs/transformers.js">transformers.js</a> from the <code>onnx-community/gpt2-ONNX</code> weights.</footer>`;
  return { top, gpt2Intro, chatIntro, end };
}
