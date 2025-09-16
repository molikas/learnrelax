import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// =============================================
// Near Double Game — v1.3.5 (2025-09-11)
// Change in this build: Random near-double button moved after the Set equation button.
// Otherwise identical to original v1.3.5 with full UI restored.
// =============================================

const VERSION = "v1.3.5 (2025-09-11)";

// ---- UI primitives ----
const BoxBase = ({ children, intent = "neutral", className = "" }) => {
  const borders = { neutral: "border-gray-300", good: "border-emerald-300", bad: "border-red-300" };
  const bg = { neutral: "bg-white", good: "bg-emerald-50", bad: "bg-red-50" };
  const text = { neutral: "text-gray-800", good: "text-emerald-800", bad: "text-red-800" };
  return (
    <div className={`relative w-48 min-h-44 rounded-2xl border-2 p-3 shadow-sm flex flex-col items-center gap-2 ${borders[intent]} ${bg[intent]} ${text[intent]} ${className}`}>
      {children}
    </div>
  );
};

function useChime() {
  const ctxRef = useRef(null);
  return () => {
    try {
      const Ctx = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!Ctx) return;
      if (!ctxRef.current) ctxRef.current = new Ctx();
      const ctx = ctxRef.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = 880;
      o.connect(g); g.connect(ctx.destination);
      const now = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.2, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.00001, now + 0.25);
      o.start(now); o.stop(now + 0.3);
    } catch {}
  };
}

const DropZone = ({ label, icon, symbol, count, goal, onAdd, onRemove, name }) => {
  const intent = count === goal ? "good" : count > goal ? "bad" : "neutral";
  const playedRef = useRef(false);
  const chime = useChime();
  useEffect(() => {
    if (count === goal && !playedRef.current) { chime(); playedRef.current = true; }
    if (count !== goal) playedRef.current = false;
  }, [count, goal, chime]);
  return (
    <BoxBase intent={intent}>
      <div className="text-2xl" aria-hidden>{icon}</div>
      <div className="text-sm text-gray-600 text-center">{label}</div>
      <div className="flex gap-2">
        <button className="px-2 py-1 rounded border hover:bg-gray-50" onClick={onAdd}>+ add</button>
        <button className="px-2 py-1 rounded border hover:bg-gray-50" onClick={onRemove} disabled={count===0}>−</button>
      </div>
      <div className="text-3xl flex flex-wrap justify-center select-none">
        {Array.from({length: count}).map((_,i)=>(<span key={i}>{symbol}</span>))}
      </div>
      <div className="text-sm font-semibold text-gray-600">{count}/{goal}</div>
      <AnimatePresence>
        {count===goal && (
          <motion.div initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.9}} className="absolute -top-2 -right-2">
            <motion.div initial={{scale:0.8}} animate={{scale:[1,1.1,1],rotate:[0,-5,0]}} transition={{duration:0.6,repeat:1}} className="text-2xl" aria-label={`${name} reached goal`}>✅</motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </BoxBase>
  );
};

const ResultBox = ({ total, target }) => {
  const intent = total === target ? "good" : total > target ? "bad" : "neutral";
  return (
    <BoxBase intent={intent}>
      <div className="text-sm text-gray-600">Result</div>
      <div className="text-5xl font-extrabold leading-none">{total}</div>
      <div className="text-xs text-gray-600">Target: {target}</div>
      <AnimatePresence>
        {total===target && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute top-2 right-2 text-xl" aria-label="total matches target">🌟</motion.div>
        )}
      </AnimatePresence>
    </BoxBase>
  );
};

// ---- picking near-doubles with focused sets ----
function pickNearDouble(kind = "normal") {
  let sPool; // s is the smaller addend
  if (kind === "advanced") sPool = [6,7,8,9];
  else sPool = [2,3,4,5,6,7]; // normal
  const s = sPool[Math.floor(Math.random()*sPool.length)];
  const pair = Math.random() < 0.5 ? [s, s+1] : [s+1, s];
  return { a: pair[0], b: pair[1] };
}

export default function NearDoubleGame() {
  // Focus set: normal | advanced
  const [setKind, setSetKind] = useState("normal");
  const [{ a, b }, setEq] = useState(() => pickNearDouble(setKind));

  // Mode: mixed | build | fix (mixed randomizes per round)
  const [mode, setMode] = useState("mixed");
  const [roundType, setRoundType] = useState("build"); // actual current round
  const firstLoadRef = useRef(true);

  const [cat, setCat] = useState(0);
  const [dog, setDog] = useState(0);
  const [mouse, setMouse] = useState(0);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  useEffect(()=>{
    setError("");
    let rt;
    if (firstLoadRef.current) {
      rt = "build"; // First puzzle is always Build It
      firstLoadRef.current = false;
    } else {
      rt = mode === "mixed" ? (Math.random() < 0.5 ? "build" : "fix") : mode;
    }
    setRoundType(rt);

    const big = Math.max(a,b);
    if (rt === "fix") {
      // Prefill with an incorrect attempt: bigger double + 1
      setCat(big); setDog(big); setMouse(1);
    } else {
      setCat(0); setDog(0); setMouse(0);
    }
  }, [a,b,mode]);

  const smaller = Math.min(a,b);
  const target = a + b;
  const total = cat + dog + mouse;
  const allDone = (cat===smaller && dog===smaller && mouse===1);

  // Scaffold: Mouse only gets snack after Cat & Dog equal the smaller addend
  const mouseEnabled = (cat===smaller && dog===smaller && mouse<1);

  // Caps (allow tiny overflow for correction)
  const capA = smaller + 2, capB = smaller + 2, capM = 1 + 1;

  // Chime for mouse when it reaches its goal (1)
  const mouseChime = useChime();
  const mousePlayedRef = useRef(false);
  useEffect(() => {
    if (mouse === 1 && !mousePlayedRef.current) { mouseChime(); mousePlayedRef.current = true; }
    if (mouse !== 1) mousePlayedRef.current = false;
  }, [mouse, mouseChime]);

  const setFromNumbers = (x, y) => {
    if (x < 1 || y < 1 || x + y > 20) { setError("Try numbers between 1 and 20, with a friendly total."); return; }
    if (Math.abs(x - y) !== 1) { setError("This game focuses on near doubles. Please enter numbers that differ by 1 (e.g., 6+7)."); return; }
    setEq({ a: x, b: y });
  };

  const applyInput = () => {
    const cleaned = input.replace(/\s+/g, "");
    const m = cleaned.match(/^(\d{1,2})[+](\d{1,2})$/);
    if (!m) { setError("Type an equation like 6+7"); return; }
    setFromNumbers(parseInt(m[1],10), parseInt(m[2],10));
  };

  const equationText = useMemo(() => `${a} + ${b} = ?`, [a,b]);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center p-6 gap-5">
      {/* TITLE */}
      <h1 className="text-2xl font-bold text-gray-800">Cat 🐱, Dog 🐶, Mouse 🐭 — Near Doubles</h1>

      {/* INSTRUCTIONS — collapsed by default, pinned under title */}
      <details className="w-full max-w-2xl mt-1">
        <summary className="cursor-pointer rounded-xl border px-4 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-medium">See instructions</summary>
        <div className="border-x border-b rounded-b-xl p-4 text-sm text-gray-800 space-y-2">
          <div className="font-semibold">How to play (for 2nd graders)</div>
          <ol className="list-decimal ml-5 space-y-1">
            <li>Read the problem at the top (for example: {a} + {b}).</li>
            <li>Give {Math.min(a,b)} cookies to the Cat and {Math.min(a,b)} cupcakes to the Dog.</li>
            <li>Give 1 cheese to the Mouse.</li>
            <li>Count all the treats together. That total is the answer!</li>
          </ol>
          <div className="font-semibold mt-2">Why we do this</div>
          <p>Near doubles are friendly because you can use a double you know (like 5 + 5 = 10) and then add one more. This makes adding faster and helps your brain see number patterns.</p>
          <div className="font-semibold mt-2">Tips</div>
          <ul className="list-disc ml-5 space-y-1">
            <li>If the number turns red, there are too many treats — take some away.</li>
            <li>Watch for the small check marks when Cat and Dog have the right amounts.</li>
            <li>A star appears when your total matches the target — nice!</li>
          </ul>
        </div>
      </details>

      {/* EQUATION HEADER (hidden when solved) */}
      {!allDone && (
        <div className="text-3xl font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
          Solve: {equationText}
        </div>
      )}

      {/* FIX BANNER (only in Fix rounds; hidden when solved) */}
      {!allDone && roundType === 'fix' && (
        <div className="text-lg sm:text-xl font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2">
          Is this correct?
        </div>
      )}

      {/* CELEBRATION — visible when solved */}
      <AnimatePresence>
        {allDone && (
          <motion.div
            initial={{opacity:0, scale:0.95}}
            animate={{opacity:1, scale:1}}
            exit={{opacity:0, scale:0.95}}
            className="w-full max-w-3xl text-center mt-1 p-4 sm:p-6 bg-emerald-100 rounded-2xl border-2 border-emerald-300 shadow"
          >
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-900 leading-tight">
              🎉 Nice! {a}+{b} = {a+b}
            </div>
            <div className="mt-1 text-base sm:text-lg text-emerald-800">
              You built it with <span className="font-semibold">{Math.min(a,b)} + {Math.min(a,b)} + 1</span>.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* INPUT */}
      <div className="w-full max-w-4xl mt-1 space-y-2">
        {/* Row 1: equation input + set + random (random moved to the end) */}
        <div className="overflow-x-auto">
          <div className="grid grid-flow-col auto-cols-max gap-2 items-center">
            <input className="rounded-xl border px-3 py-2 w-28 sm:w-36 md:w-48" placeholder="6+7" value={input} onChange={(e)=>{setInput(e.target.value); setError('');}}/>
            <button className="px-3 py-2 rounded-xl border hover:bg-gray-50" onClick={applyInput}>✏️ Set equation</button>
            <button
              className="px-4 py-2 rounded-xl border border-emerald-600 bg-emerald-600 text-white font-semibold shadow-sm hover:bg-emerald-700 active:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              onClick={()=>setEq(pickNearDouble(setKind))}
              title="Get a random near-double"
            >
              <span className="mr-1 text-lg" aria-hidden>🎲</span>
              Random near-double
            </button>
          </div>
        </div>
        {/* Row 2: compact More options */}
        <details className="w-full max-w-4xl">
          <summary className="cursor-pointer rounded-lg border px-3 py-1 bg-white hover:bg-gray-50 text-xs font-medium text-gray-600">More options</summary>
          <div className="border-x border-b rounded-b-lg p-3 bg-white">
            <div className="grid grid-flow-col auto-cols-max items-center gap-2 text-sm">
              <label className="text-xs text-gray-600">Focus set</label>
              <select className="rounded-lg border px-2 py-1" value={setKind} onChange={e=>{ const v = e.target.value; setSetKind(v); setEq(pickNearDouble(v)); }}>
                <option value="normal">Normal</option>
                <option value="advanced">Advanced</option>
              </select>
              <span className="w-px h-5 bg-gray-200 mx-1" aria-hidden></span>
              <label className="text-xs text-gray-600">Mode</label>
              <select className="rounded-lg border px-2 py-1" value={mode} onChange={e=>setMode(e.target.value)}>
                <option value="mixed">Mixed</option>
                <option value="build">Build It</option>
                <option value="fix">Fix It</option>
              </select>
            </div>
          </div>
        </details>
      </div>
      {error && <div className="text-red-700 text-sm">{error}</div>}

      {/* DOTS */}
      <div className="w-full max-w-4xl mt-2 rounded-2xl border p-3 bg-white">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2"><span>🐱</span><div className="flex flex-wrap gap-1">{Array.from({length: cat}).map((_,i)=>(<span key={i} className="inline-block w-3 h-3 rounded-full bg-emerald-400"></span>))}</div></div>
          <div className="flex items-center gap-2"><span>🐶</span><div className="flex flex-wrap gap-1">{Array.from({length: dog}).map((_,i)=>(<span key={i} className="inline-block w-3 h-3 rounded-full bg-emerald-400"></span>))}</div></div>
          <div className="flex items-center gap-2"><span>🐭</span><div className="flex flex-wrap gap-1">{Array.from({length: mouse}).map((_,i)=>(<span key={i} className="inline-block w-3 h-3 rounded-full bg-emerald-400"></span>))}</div></div>
        </div>
      </div>

      {/* ANIMAL_ROW */}
      <div className="w-full max-w-5xl">
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center justify-items-center gap-3">
          <DropZone name="Cat" label={`Cat gets ${Math.min(a,b)} cookies`} icon="🐱" symbol="🍪" count={cat} goal={Math.min(a,b)} onAdd={()=>setCat(c=>Math.min(c+1, capA))} onRemove={()=>setCat(c=>Math.max(0, c-1))} />
          <div className="text-4xl font-black">+</div>
          <DropZone name="Dog" label={`Dog gets ${Math.min(a,b)} cupcakes`} icon="🐶" symbol="🧁" count={dog} goal={Math.min(a,b)} onAdd={()=>setDog(d=>Math.min(d+1, capB))} onRemove={()=>setDog(d=>Math.max(0, d-1))} />
          <div className="text-4xl font-black">+</div>
          <BoxBase intent={mouse<1? 'neutral' : mouse>1? 'bad':'good'}>
            <div className="text-2xl" aria-hidden>🐭</div>
            <div className="text-sm text-gray-600 text-center">Mouse gets +1 cheese</div>
            <div className="flex gap-2">
              <button className={`px-2 py-1 rounded border ${mouseEnabled? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`} onClick={()=> mouseEnabled && setMouse(m=>Math.min(m+1, capM))}>+ add</button>
              <button className="px-2 py-1 rounded border hover:bg-gray-50" onClick={()=>setMouse(m=>Math.max(0, m-1))} disabled={mouse===0}>−</button>
            </div>
            <div className="text-3xl select-none">{Array.from({length: mouse}).map((_,i)=>(<span key={i}>🧀</span>))}</div>
            <div className="text-sm font-semibold text-gray-600">{mouse}/1</div>
            {!mouseEnabled && (
              <div className="mt-1 text-xs text-gray-600">The Mouse will get the last snack!</div>
            )}
            {/* ✅ Mouse goal check animation */}
            <AnimatePresence>
              {mouse === 1 && (
                <motion.div initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.9}} className="absolute -top-2 -right-2">
                  <motion.div initial={{scale:0.8}} animate={{scale:[1,1.1,1],rotate:[0,-5,0]}} transition={{duration:0.6,repeat:1}} className="text-2xl" aria-label={`Mouse reached goal`}>✅</motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </BoxBase>
          <div className="text-4xl font-black">=</div>
          <ResultBox total={total} target={target} />
        </div>
      </div>

      {/* STATUS */}
      <div className="text-sm text-gray-700">
        Target: <span className="font-semibold">{target}</span> · Result: {" "}
        <span className={`font-semibold ${ total > target ? 'text-red-700' : total===target ? 'text-emerald-700' : 'text-gray-800'}`}>{total}</span>
      </div>

      <div className="mt-6 text-xs text-gray-400">Version {VERSION}</div>
    </div>
  );
}
