import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BracketsCurly, CalendarBlank, CaretDown, Check, CheckCircle,
  Copy, FileCode, GitCommit, GitFork, Info, LinkSimple, Minus, PlayCircle,
  Plus, SlidersHorizontal, WarningCircle, X,
} from "@phosphor-icons/react";

import { forkTape, inspectTape, listTapes, loadDemo, saveRegression } from "./agenttape-client.js";

const INJECTIONS = [
  ["permission_denied", "Permission denied", "Substitute a denied tool result"],
  ["timeout", "Tool timeout", "Substitute a deterministic timeout"],
  ["rate_limited", "Rate limited (429)", "Substitute a 429 rate limit with retry-after"],
  ["malformed_json", "Malformed JSON", "Substitute an invalid JSON result"],
  ["truncated_response", "Truncated response", "Substitute a bounded response"],
];
const SUPPORTED_INJECTIONS = new Set(INJECTIONS.map(([value]) => value));

function MetaItem({ icon: Icon, label, children }) {
  return <div className="meta-item"><Icon size={15} /><span>{label}</span><strong>{children}</strong></div>;
}

function DotEvent({ value, active, tone = "captured", label, onClick, showIds }) {
  return (
    <button className={`dot-event ${tone} ${active ? "active" : ""}`} onClick={onClick} aria-label={`Event ${value}${label ? ` ${label}` : ""}`}>
      <span className="dot-ring">{tone === "fork" && <GitFork size={15} weight="bold" />}{tone === "failed" && <X size={15} weight="bold" />}{tone === "success" && <Check size={15} weight="bold" />}</span>
      {showIds && <span className="dot-id">{value}</span>}
      {label && <span className="dot-label">{label}</span>}
    </button>
  );
}

function StatusScreen({ title, detail, error = false }) {
  return <div className="reference-app status-screen"><div className="status-card">{error ? <WarningCircle size={28} /> : <span className="status-pulse" />}<strong>{title}</strong><p>{detail}</p></div></div>;
}

function eventLabel(event) {
  if (event.tool?.name) return event.tool.name;
  return event.type.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function prettyLines(value, tone, prefix) {
  const text = JSON.stringify(value ?? null, null, 2);
  return text.split("\n").map((line, index) => [tone, `${prefix}${line}`, index + 1]);
}

function safeFilename(id, injection) {
  const stem = id.replace(/^tape_/, "").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 64);
  return `${stem}-${injection.replaceAll("_", "-")}.tape`;
}

function replayRequest(inspection, id, injection) {
  const firstFailure = inspection.failures[0];
  const targetSequence = inspection.run.injection?.targetSequence || firstFailure?.sequence;
  const boundarySequence = inspection.run.fork?.boundarySequence || Math.max(1, (targetSequence || 2) - 1);
  return {
    id,
    boundarySequence,
    ...(targetSequence ? { targetSequence } : {}),
    injection,
  };
}

export function App() {
  const [tapes, setTapes] = useState([]);
  const [mode, setMode] = useState("local");
  const [demo, setDemo] = useState(null);
  const [selectedTapeId, setSelectedTapeId] = useState("");
  const [inspection, setInspection] = useState(null);
  const [forkResult, setForkResult] = useState(null);
  const [condition, setCondition] = useState("permission_denied");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingTape, setLoadingTape] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [fatalError, setFatalError] = useState("");
  const [actionError, setActionError] = useState("");
  const [showIds, setShowIds] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [tab, setTab] = useState("compare");
  const [conditionMenu, setConditionMenu] = useState(false);
  const [showTape, setShowTape] = useState(false);
  const [savedPath, setSavedPath] = useState("");
  const [toast, setToast] = useState("");
  const [selectedEvent, setSelectedEvent] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await listTapes();
        if (cancelled) return;
        setTapes(result.tapes);
        setSelectedTapeId(result.tapes[0]?.id || "");
      } catch (apiError) {
        try {
          const result = await loadDemo();
          if (cancelled) return;
          setMode("demo");
          setDemo(result);
          setTapes(result.list.tapes);
          setSelectedTapeId(result.list.tapes[0]?.id || "");
        } catch {
          if (!cancelled) setFatalError(apiError.message);
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedTapeId) return undefined;
    let cancelled = false;
    setLoadingTape(true);
    setInspection(null);
    setForkResult(null);
    setSavedPath("");
    setActionError("");

    const inspectionPromise = mode === "demo" ? Promise.resolve(demo?.inspection) : inspectTape(selectedTapeId);
    inspectionPromise.then(async (result) => {
      if (!result) throw new Error("Demo inspection data is unavailable.");
      if (cancelled) return;
      const recordedKind = result.run.injection?.kind || result.failures[0]?.kind;
      const initialCondition = SUPPORTED_INJECTIONS.has(recordedKind) ? recordedKind : "permission_denied";
      setInspection(result);
      setCondition(initialCondition);
      setSelectedEvent(String(result.run.fork?.boundarySequence || result.events[0]?.sequence || ""));
      const replay = mode === "demo"
        ? demo.forks[initialCondition]
        : await forkTape(replayRequest(result, selectedTapeId, initialCondition));
      if (!cancelled) setForkResult(replay);
    }).catch((error) => {
      if (!cancelled) setActionError(error.message);
    }).finally(() => {
      if (!cancelled) setLoadingTape(false);
    });
    return () => { cancelled = true; };
  }, [selectedTapeId, mode, demo]);

  const model = useMemo(() => {
    if (!inspection) return null;
    const targetSequence = inspection.run.injection?.targetSequence || inspection.failures[0]?.sequence;
    const boundarySequence = inspection.run.fork?.boundarySequence || Math.max(1, (targetSequence || 2) - 1);
    const target = inspection.events.find((event) => event.sequence === targetSequence);
    const captured = inspection.events.filter((event) => event.sequence < boundarySequence);
    const original = inspection.events.filter((event) => event.sequence > boundarySequence);
    const branch = (forkResult?.events || []).filter((event) => event.sequence > boundarySequence);
    return { targetSequence, boundarySequence, target, captured, original, branch };
  }, [inspection, forkResult]);

  if (loadingList) return <StatusScreen title="Loading workspace tapes" detail="Reading redacted AgentTape captures from this workspace." />;
  if (fatalError) return <StatusScreen error title="AgentTape API unavailable" detail={fatalError} />;
  if (!tapes.length) return <StatusScreen title="No captures yet" detail="Run a supported Codex task with the AgentTape plugin, then refresh this page." />;
  if (!inspection || !model) return <StatusScreen error={Boolean(actionError)} title={loadingTape ? "Inspecting tape" : "Tape could not be loaded"} detail={actionError || "Validating events, failures, and replay confidence."} />;

  const { run, failures, replayConfidence, redaction } = inspection;
  const request = replayRequest(inspection, selectedTapeId, condition);
  const filename = safeFilename(selectedTapeId, condition);
  const failure = failures[0];
  const branchStatus = forkResult?.status === "completed" ? condition : "playback_only";
  const sourceLabel = `${run.source.adapter} · ${run.source.coverage}`;
  const branchPreview = JSON.stringify({
    sourceTapeId: selectedTapeId,
    branch: forkResult?.branch || null,
    diff: forkResult?.diff || null,
    confidence: forkResult?.confidence || null,
    evidence: forkResult?.evidence || null,
    output: `tests/agenttape/${filename}`,
  }, null, 2);

  async function pickCondition(value) {
    setCondition(value);
    setConditionMenu(false);
    setBusyAction("fork");
    setActionError("");
    setSavedPath("");
    try {
      const replay = mode === "demo"
        ? demo.forks[value]
        : await forkTape(replayRequest(inspection, selectedTapeId, value));
      setForkResult(replay);
      setToast(`Fork ${replay.status} · ${replay.evidence.modelCallsBeforeFork} model calls`);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusyAction("");
    }
  }

  async function saveTape() {
    if (mode === "demo") return;
    setBusyAction("save");
    setActionError("");
    try {
      const result = await saveRegression({ ...request, filename });
      setSavedPath(result.path);
      setShowTape(false);
      setToast(`Saved ${result.path}`);
    } catch (error) {
      setActionError(error.message);
      setShowTape(false);
    } finally {
      setBusyAction("");
    }
  }

  function copyBranch() {
    navigator.clipboard?.writeText(branchPreview);
    setToast("Branch manifest copied");
  }

  return (
    <div className="reference-app">
      <header className="hero-header">
        <div className="header-strip">
          <div className="brand-lockup"><img src="/assets/agenttape-mark.png" alt="" /><strong>AgentTape</strong><span>/</span><em>Branch Canvas</em>{mode === "demo" && <b className="mode-badge">Demo</b>}</div>
          <div className="run-economics"><span className="live-dot" /> <strong>{forkResult?.evidence?.replayedEventCount ?? 0}</strong> captured events replayed <i>·</i> <strong>{forkResult?.evidence?.modelCallsBeforeFork ?? 0}</strong> model calls <i>·</i> <strong>{forkResult?.evidence?.liveToolCalls ?? 0}</strong> live tools</div>
        </div>
        <div className="run-heading">
          <div>
            <h1>{failure ? `Recorded failure: ${failure.toolName}` : `Captured run: ${run.id}`}</h1>
            <div className="run-meta">
              <MetaItem icon={PlayCircle} label="Source">{sourceLabel}</MetaItem>
              <div className="meta-item tape-picker"><FileCode size={15} /><span>Tape</span><select aria-label="Select tape" value={selectedTapeId} onChange={(event) => setSelectedTapeId(event.target.value)}>{tapes.map((tape) => <option value={tape.id} key={tape.id}>{tape.id}</option>)}</select></div>
              <MetaItem icon={LinkSimple} label="Session">{run.source.sessionId}</MetaItem>
              <MetaItem icon={CheckCircle} label="Replay">{forkResult?.status || "pending"}{mode === "demo" ? " · demo" : ""}</MetaItem>
            </div>
          </div>
          <div className="captured-date"><span>Captured on</span><strong>{run.capturedAt.slice(0, 10)} <CalendarBlank size={16} /></strong></div>
        </div>
      </header>

      <main className="branch-layout">
        <section className="branch-panel">
          <div className="branch-toolbar">
            <div className="branch-title"><h2>Causal branch canvas</h2><Info size={16} /></div>
            <div className="canvas-actions">
              <div className="zoom-buttons"><button onClick={() => setZoom(Math.max(80, zoom - 10))} aria-label="Zoom out"><Minus size={16} /></button><button onClick={() => setZoom(Math.min(120, zoom + 10))} aria-label="Zoom in"><Plus size={16} /></button></div>
              <button className="fit-button" onClick={() => setZoom(100)}>Fit to view</button>
              <label className="id-toggle"><input type="checkbox" checked={showIds} onChange={(event) => setShowIds(event.target.checked)} /> <span><Check size={12} weight="bold" /></span> Show event IDs</label>
            </div>
          </div>
          {actionError && <div className="inline-error"><WarningCircle size={16} /><span>{actionError}</span></div>}

          <div className="legend">
            <div><span className="legend-line captured" /> Captured past (fixed)</div>
            <div><span className="legend-line failed" /> Original trajectory</div>
            <div><span className="legend-fork" /> Fork boundary (event {model.boundarySequence})</div>
            <div><span className="legend-line live" /> Injected structural branch</div>
          </div>

          <div className="graph-viewport">
            <div className="causal-graph" style={{ "--graph-scale": zoom / 100 }}>
              <div className="group-caption captured-caption"><strong>Captured past</strong><span>{model.captured.length} fixed event(s)</span></div>
              <div className="group-caption fork-caption"><strong>Fork boundary</strong><span>Event {model.boundarySequence}</span></div>
              <div className="group-caption failed-caption"><strong>Original trajectory</strong><span>{model.original.length} recorded event(s)</span></div>
              <div className="group-caption live-caption"><strong>Injected branch</strong><span>{model.branch.length} structural event(s)</span></div>

              <div className="graph-line captured-path" /><div className="graph-line failed-path" /><div className="graph-line branch-curve-a" /><div className="graph-line branch-curve-b" /><div className="graph-line live-path" />
              <div className="trajectory-bracket failed-bracket" /><div className="trajectory-bracket live-bracket" />

              <div className="events-row captured-row">
                {model.captured.map((event) => <DotEvent key={event.sequence} value={event.sequence} tone="captured" showIds={showIds} label={eventLabel(event)} onClick={() => setSelectedEvent(String(event.sequence))} active={selectedEvent === String(event.sequence)} />)}
              </div>
              <div className="fork-event"><DotEvent value={model.boundarySequence} tone="fork" showIds={showIds} active={selectedEvent === String(model.boundarySequence)} onClick={() => setSelectedEvent(String(model.boundarySequence))} /></div>
              <div className="events-row failed-row">
                {model.original.map((event) => <DotEvent key={event.sequence} value={event.sequence} tone={event.tool?.failed ? "failed" : "failed-path-dot"} showIds={showIds} label={eventLabel(event)} onClick={() => setSelectedEvent(String(event.sequence))} active={selectedEvent === String(event.sequence)} />)}
              </div>
              <div className="failure-note"><code>{failure?.toolName || "No recorded tool failure"}</code><strong>{failure?.kind || run.status}</strong></div>
              <div className="events-row live-row">
                {model.branch.map((event) => <DotEvent key={`branch-${event.sequence}`} value={`${event.sequence}′`} tone="live-path-dot" showIds={showIds} label={event.tool?.failure?.kind || eventLabel(event)} onClick={() => setSelectedEvent(`branch:${event.sequence}`)} active={selectedEvent === `branch:${event.sequence}`} />)}
              </div>

              <div className="how-to-read">
                <strong>How to read</strong>
                <div><span className="mini-track"><i /><i /></span>Recorded events before the boundary</div>
                <div><span className="mini-fork" />Deterministic divergence point</div>
                <div><span className="mini-track green"><i /><i /></span>Recorded-result substitution</div>
              </div>
            </div>
          </div>
        </section>

        <aside className="compare-panel">
          <div className="event-heading">
            <div><strong>Event {model.targetSequence}</strong><code>{model.target?.tool?.name || failure?.toolName || "recorded event"}</code><span className="fork-badge">Structural</span></div>
            <button className="icon-button" aria-label="Close inspector" onClick={() => setSelectedEvent("")}><X size={18} /></button>
          </div>
          <p className="event-description">Replays captured state through event {model.boundarySequence}, then substitutes the recorded result at event {model.targetSequence}.<br />No model or live tool is called.</p>
          <div className="compare-tabs"><button className={tab === "compare" ? "active" : ""} onClick={() => setTab("compare")}>Compare</button><button className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}>Details</button></div>

          {tab === "compare" ? <>
            <div className="result-headings"><div><span>Original</span><strong>{failure?.kind || run.status}</strong></div><div><span>Fork (injected)</span><strong>{branchStatus}</strong></div></div>
            <DiffBlock title="Tool input (unchanged)" lines={prettyLines(model.target?.tool?.input, "plain", "  ")} />
            <DiffBlock title="Result diff" lines={[
              ...prettyLines(forkResult?.diff?.before ?? model.target?.tool?.output, "remove", "- "),
              ...prettyLines(forkResult?.diff?.after, "add", "+ "),
            ]} />
          </> : <div className="details-view"><div><span>Captured events</span><strong>{run.summary.eventCount}</strong></div><div><span>Replay confidence</span><strong>{forkResult?.confidence?.level || replayConfidence?.level || "unknown"}</strong></div><div><span>Coverage</span><strong>{run.source.coverage}</strong></div><div><span>Redaction</span><strong>{redaction.applied ? `${redaction.count} value(s)` : "not required"}</strong></div></div>}

          <div className="inspector-actions">
            <label>Regression test target</label>
            <div className="target-file"><code>{mode === "demo" ? `Demo · tests/agenttape/${filename}` : savedPath || `tests/agenttape/${filename}`}</code><button aria-label="Copy target path" onClick={() => { navigator.clipboard?.writeText(savedPath || `tests/agenttape/${filename}`); setToast("Target path copied"); }}><Copy size={17} /></button></div>
            <button className="turn-into-test" disabled={mode === "demo" || busyAction !== "" || forkResult?.status !== "completed"} onClick={() => setShowTape(true)}>{savedPath ? <Check size={17} weight="bold" /> : <FileCode size={17} />}{mode === "demo" ? "Install locally to save" : savedPath ? "Regression test saved" : "Turn branch into test"}<ArrowRight size={17} /></button>
            <div className="condition-wrap">
              <button className="change-condition" disabled={busyAction !== ""} onClick={() => setConditionMenu(!conditionMenu)}>{busyAction === "fork" ? "Replaying…" : "Change condition"} <SlidersHorizontal size={17} /></button>
              {conditionMenu && <div className="condition-menu">
                <span>Fork event {model.boundarySequence} with</span>
                {INJECTIONS.map(([value, name, detail]) => <button key={value} onClick={() => pickCondition(value)}><span className={`condition-radio ${condition === value ? "selected" : ""}`}>{condition === value && <Check size={11} weight="bold" />}</span><span><strong>{name}</strong><small>{detail}</small></span></button>)}
              </div>}
            </div>
          </div>
        </aside>
      </main>

      {showTape && <div className="modal-backdrop" onMouseDown={() => setShowTape(false)}><div className="tape-modal" role="dialog" aria-modal="true" aria-labelledby="tape-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header"><div><span className="modal-icon"><FileCode size={20} /></span><span><strong id="tape-title">Pin structural branch as regression</strong><small>tests/agenttape/{filename}</small></span></div><button className="icon-button" onClick={() => setShowTape(false)} aria-label="Close"><X size={18} /></button></div>
        <div className="modal-body"><div className="tape-explainer"><CheckCircle size={18} weight="fill" /><span><strong>Replay confidence: {forkResult?.confidence?.level || "unknown"}</strong><small>This branch uses captured state, {forkResult?.evidence?.modelCallsBeforeFork ?? 0} model calls, and {forkResult?.evidence?.liveToolCalls ?? 0} live tools.</small></span></div><div className="code-editor"><div className="code-toolbar"><span><BracketsCurly size={14} /> branch manifest v1</span><button onClick={copyBranch}><Copy size={14} /> Copy</button></div><pre>{branchPreview}</pre></div></div>
        <div className="modal-footer"><span><GitCommit size={14} /> Based on {selectedTapeId}</span><div><button className="secondary-button" onClick={() => setShowTape(false)}>Cancel</button><button className="primary-button" disabled={busyAction !== ""} onClick={saveTape}><Check size={16} weight="bold" /> {busyAction === "save" ? "Saving…" : "Save .tape"}</button></div></div>
      </div></div>}
      {toast && <button className="toast" onClick={() => setToast("")}><CheckCircle size={17} weight="fill" /><span>{toast}</span><X size={14} /></button>}
    </div>
  );
}

function DiffBlock({ title, lines }) {
  return <section className="diff-block"><div className="diff-title"><strong>{title}</strong><button>Captured <CaretDown size={13} /></button></div><div className="diff-code">{lines.map(([tone, text, line], index) => <div className={tone} key={`${text}-${index}`}><span>{line ?? index + 1}</span><code>{text}</code></div>)}</div></section>;
}
