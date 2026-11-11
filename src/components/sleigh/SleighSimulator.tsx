"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  createFlight,
  pauseFlight,
  resumeFlight,
  startFlight,
  stepFlight,
  ROUTE_LENGTH,
  type FlightInput,
  type FlightState,
} from "./flight";
import { SleighScene } from "./scene";
import { createDelivery, predictThrow, stepDelivery, throwPackage, type ThrowPrediction } from "./delivery";
import { chargePower, createAim, keyboardAim, makeThrowSource, pointerAim } from "./aim";
import { DELIVERY_TARGET_COUNT } from "./houses";
import { getEnvironment, type TimeMode, type WeatherMode } from "./environment";
import { ROUTE_STOPS, routeStopAt } from "./route";
import { SleighAudio } from "./audio";
import { Icon, JuliusPortrait } from "./icons";
import "./sleigh.css";

export interface SleighSimulatorProps {
  /** Called once for each finished flight. */
  onComplete?: (result: {
    points: number;
    deliveredHouses: number;
    totalHouses: number;
    packagesThrown: number;
    elapsed: number;
    arrived: boolean;
  }) => void;
  className?: string;
}
const neutral: FlightInput = { steer: 0, climb: 0, boost: false, brake: false };
type Dialog = "help" | "settings" | null;
const motionSnapshot = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const motionSubscribe = (callback: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
function Gauge({
  value,
  max,
  label,
  unit,
}: {
  value: number;
  max: number;
  label: string;
  unit: string;
}) {
  const angle = -120 + Math.min(value / max, 1) * 240;
  return (
    <div className="sl-gauge">
      <span className="sl-gauge-label">{label}</span>
      <svg viewBox="0 0 120 80" aria-hidden="true">
        <path
          d="M22 63a44 44 0 1 1 76 0"
          fill="none"
          stroke="#b7a177"
          strokeWidth="1"
        />
        {Array.from({ length: 13 }, (_, i) => {
          const a = ((150 + i * 20) * Math.PI) / 180;
          return (
            <line
              key={i}
              x1={60 + Math.cos(a) * 40}
              y1={42 + Math.sin(a) * 40}
              x2={60 + Math.cos(a) * (i % 3 === 0 ? 32 : 36)}
              y2={42 + Math.sin(a) * (i % 3 === 0 ? 32 : 36)}
              stroke="#b7a177"
              strokeWidth={i % 3 === 0 ? 1.4 : 0.7}
            />
          );
        })}
        <g transform={`translate(60 42) rotate(${angle})`}>
          <path d="M-2 5L0-32 2 5z" fill="#d6aa66" />
          <circle r="4" fill="#c7ad79" />
        </g>
      </svg>
      <div className="sl-gauge-number">
        {Math.round(value)}
        <span>{unit}</span>
      </div>
    </div>
  );
}

export default function SleighSimulator({
  onComplete,
  className = "",
}: SleighSimulatorProps) {
  const root = useRef<HTMLElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(createFlight()),
    keys = useRef(new Set<string>()),
    touch = useRef<FlightInput>({ ...neutral });
  const soundRef = useRef<SleighAudio | null>(null),
    optionsRef = useRef({
      snow: true,
      gentle: false,
      timeMode: "auto" as TimeMode,
      weatherMode: "auto" as WeatherMode,
    });
  const callbackRef = useRef(onComplete);
  const deliveryRef = useRef(createDelivery());
  const aimRef = useRef(createAim());
  const predictionRef = useRef<ThrowPrediction | null>(null);
  const chargeRef = useRef<{ started: number; pointerId?: number } | null>(null);
  const throwQueueRef = useRef<number | null>(null);
  const completionReported = useRef(false);
  const [delivery, setDelivery] = useState(createDelivery);
  const [aimView, setAimView] = useState({ prediction: null as ThrowPrediction | null, charge: 0 });
  const [flight, setFlight] = useState(createFlight),
    [sound, setSound] = useState(false),
    [dialog, setDialog] = useState<Dialog>(null);
  const [map, setMap] = useState(false),
    [snow, setSnow] = useState(true),
    [gentleOverride, setGentle] = useState<boolean | null>(null),
    [notice, setNotice] = useState("");
  const [timeMode, setTimeMode] = useState<TimeMode>("auto"),
    [weatherMode, setWeatherMode] = useState<WeatherMode>("auto");
  const prefersGentle = useSyncExternalStore(
    motionSubscribe,
    motionSnapshot,
    () => false,
  );
  const gentle = gentleOverride ?? prefersGentle;
  const [fullscreen, setFullscreen] = useState(false),
    [audioError, setAudioError] = useState(false);
  const [sceneError, setSceneError] = useState("");
  const showResults = flight.phase === "complete" && !delivery.packages.some((parcel) => !parcel.landed);
  const phase = flight.phase,
    ready = phase === "ready",
    flying = phase === "flying";
  useEffect(() => {
    callbackRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    optionsRef.current = { snow, gentle, timeMode, weatherMode };
  }, [snow, gentle, timeMode, weatherMode]);
  const commit = useCallback((state: FlightState) => {
    stateRef.current = state;
    setFlight(state);
  }, []);
  const clearInput = useCallback(() => {
    keys.current.clear();
    touch.current = { ...neutral };
    chargeRef.current = null;
    throwQueueRef.current = null;
  }, []);
  const resetDeliveries = useCallback(() => {
    deliveryRef.current = createDelivery();
    aimRef.current = createAim();
    predictionRef.current = null;
    completionReported.current = false;
    setDelivery(deliveryRef.current);
    setAimView({ prediction: null, charge: 0 });
    setNotice("");
  }, []);
  const beginThrow = useCallback((pointerId?: number) => {
    if (stateRef.current.phase !== "flying" || chargeRef.current || deliveryRef.current.cooldown > 0) return;
    chargeRef.current = { started: stateRef.current.elapsed, pointerId };
  }, []);
  const releaseThrow = useCallback((pointerId?: number) => {
    const charge = chargeRef.current;
    if (!charge || charge.pointerId !== pointerId) return;
    chargeRef.current = null;
    if (stateRef.current.phase === "flying")
      throwQueueRef.current = chargePower(stateRef.current.elapsed - charge.started);
  }, []);
  const pause = useCallback(() => {
    clearInput();
    commit(pauseFlight(stateRef.current));
  }, [commit, clearInput]);
  const resume = useCallback(
    () => commit(resumeFlight(stateRef.current)),
    [commit],
  );
  const launch = useCallback(() => {
    clearInput();
    setMap(false);
    setDialog(null);
    resetDeliveries();
    commit(startFlight(createFlight()));
  }, [commit, clearInput, resetDeliveries]);
  const reset = useCallback(() => {
    clearInput();
    setDialog(null);
    resetDeliveries();
    commit(createFlight());
  }, [commit, clearInput, resetDeliveries]);
  const openDialog = (value: Dialog) => {
    if (stateRef.current.phase === "flying") pause();
    setDialog(value);
  };
  const toggleSound = async () => {
    if (sound) {
      soundRef.current?.disable();
      setSound(false);
      return;
    }
    try {
      soundRef.current ??= new SleighAudio();
      await soundRef.current.enable();
      setSound(true);
      setAudioError(false);
    } catch {
      setAudioError(true);
    }
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      setNotice("Fullskjerm er ikke tilgjengelig i denne visningen.");
    }
  };
  useEffect(() => {
    const change = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  useEffect(() => {
    const host = root.current;
    if (!host || !canvas.current) return;
    let scene: SleighScene;
    try {
      scene = new SleighScene(canvas.current);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "3D-visningen kunne ikke starte.";
      const errorFrame = requestAnimationFrame(() => setSceneError(message));
      return () => cancelAnimationFrame(errorFrame);
    }
    const onLost = () => {
      clearInput();
      commit(pauseFlight(stateRef.current));
      setSceneError(
        "3D-visningen ble avbrutt. Venter på at grafikken skal bli klar igjen.",
      );
    };
    const onRestored = () => setSceneError(scene.error);
    const surface = canvas.current;
    surface.addEventListener("webglcontextlost", onLost);
    surface.addEventListener("webglcontextrestored", onRestored);
    const resize = new ResizeObserver(([entry]) =>
      scene.resize(entry.contentRect.width, entry.contentRect.height),
    );
    resize.observe(host);
    let frame = 0,
      last = 0,
      lastUI = 0,
      sceneTime = 0,
      lastPrediction = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      const state = stateRef.current,
        k = keys.current,
        t = touch.current;
      const input: FlightInput = {
        steer: Math.max(
          -1,
          Math.min(
            1,
            (k.has("arrowright") || k.has("d") ? 1 : 0) -
              (k.has("arrowleft") || k.has("a") ? 1 : 0) +
              t.steer,
          ),
        ),
        climb: Math.max(
          -1,
          Math.min(
            1,
            (k.has("arrowup") || k.has("w") ? 1 : 0) -
              (k.has("arrowdown") || k.has("s") ? 1 : 0) +
              t.climb,
          ),
        ),
        boost: k.has("shift") || t.boost,
        brake: k.has(" ") || t.brake,
      };
      const next = stepFlight(state, input, dt);
      stateRef.current = next;
      const environment = getEnvironment(next.elapsed, optionsRef.current);
      const wind = { x: environment.windX, z: environment.windZ };
      const previousDelivery = deliveryRef.current;
      const inFlight = previousDelivery.packages.some((parcel) => !parcel.landed);
      if (next.phase === "flying" || (next.phase === "complete" && inFlight)) {
        deliveryRef.current = stepDelivery(previousDelivery, wind, dt);
      }
      if (next.phase === "flying") {
        aimRef.current = keyboardAim(aimRef.current,
          Number(k.has("l")) - Number(k.has("j")),
          Number(k.has("i")) - Number(k.has("k")), dt);
        if (throwQueueRef.current !== null) {
          deliveryRef.current = throwPackage(deliveryRef.current, makeThrowSource(next, state, dt),
            { ...aimRef.current, power: throwQueueRef.current });
          throwQueueRef.current = null;
        }
      }
      const charge = chargeRef.current
        ? Math.min(1, Math.max(0, (next.elapsed - chargeRef.current.started) / 0.85)) : 0;
      const activeAim = { ...aimRef.current, power: 36 + charge * 22 };
      if (next.phase === "flying" && now - lastPrediction >= 50) {
        predictionRef.current = predictThrow(makeThrowSource(next, state, dt), activeAim, wind);
        lastPrediction = now;
      } else if (next.phase !== "flying") predictionRef.current = null;
      const landing = deliveryRef.current.lastLanding;
      if (landing && landing.packageId !== previousDelivery.lastLanding?.packageId) {
        if (landing.awarded > 0) soundRef.current?.bell();
        setNotice(landing.awarded > 0
          ? `+${landing.awarded} poeng · ${landing.distance === 0 ? "Rett på huset!" : `${landing.distance?.toFixed(1).replace(".", ",")} m fra huset`}`
          : landing.points > 0 ? "Huset har allerede fått et bedre kast. Prøv et nytt hus!" : "Pakken landet for langt unna. Prøv å bremse og sikt igjen.");
      }
      if (next.lives < state.lives) {
        setNotice(next.altitude <= 26 ? "Litt høyere! Pass på tretoppene." : "Hold deg inne i dalen!");
      }
      const settling = deliveryRef.current.packages.some((parcel) => !parcel.landed);
      if (next.phase === "complete" && !settling && !completionReported.current) {
        completionReported.current = true;
        callbackRef.current?.({
          points: deliveryRef.current.score,
          deliveredHouses: deliveryRef.current.deliveries,
          totalHouses: DELIVERY_TARGET_COUNT,
          packagesThrown: deliveryRef.current.thrown,
          elapsed: next.elapsed,
          arrived: next.outcome === "arrived",
        });
      }
      if (state.phase !== "paused" && (state.phase !== "complete" || settling)) sceneTime += dt;
      scene.draw(next, sceneTime, optionsRef.current, {
        delivery: deliveryRef.current, prediction: predictionRef.current, aim: activeAim, charge,
      });
      soundRef.current?.setWeather(environment.windX);
      soundRef.current?.setSpeed(next.phase === "flying" ? next.speed : 0);
      if (now - lastUI > 80 || next.phase !== state.phase) {
        setFlight({ ...next });
        setDelivery(deliveryRef.current);
        setAimView({ prediction: predictionRef.current, charge });
        lastUI = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      scene.dispose();
      surface.removeEventListener("webglcontextlost", onLost);
      surface.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [clearInput, commit]);
  useEffect(() => () => soundRef.current?.dispose(), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3200);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const controlled = [
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
      "w",
      "a",
      "s",
      "d",
      "shift",
      " ",
      "i", "j", "k", "l", "e",
    ];
    const down = (event: KeyboardEvent) => {
      if (!root.current?.contains(document.activeElement) || sceneError) return;
      const key = event.key.toLowerCase();
      if ((key === "escape" || key === "p") && !event.repeat) {
        event.preventDefault();
        if (dialog) {
          setDialog(null);
          return;
        }
        if (stateRef.current.phase === "flying") pause();
        else if (stateRef.current.phase === "paused") resume();
        return;
      }
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      if (controlled.includes(key) && stateRef.current.phase === "flying") {
        if (key === " " && event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        keys.current.add(key);
        if (key === "e" && !event.repeat) beginThrow();
      }
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      keys.current.delete(key);
      if (key === "e") releaseThrow();
    };
    const blur = () => {
      clearInput();
      if (stateRef.current.phase === "flying") pause();
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [pause, resume, clearInput, dialog, sceneError, beginThrow, releaseThrow]);
  // Keep focus inside overlays and restore it to the simulator when they close.
  const dialogBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dialog && phase !== "paused" && !showResults && !sceneError)
      return;
    const simulator = root.current;
    const previous = document.activeElement as HTMLElement | null;
    const box = dialogBox.current;
    (box?.querySelector<HTMLButtonElement>("button") ?? box)?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !box) return;
      const controls = box.querySelectorAll<HTMLElement>("button,input,select");
      if (controls.length === 0) {
        event.preventDefault();
        return;
      }
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (stateRef.current.phase === "flying") simulator?.focus();
      else if (previous?.isConnected) previous.focus();
      else simulator?.focus();
    };
  }, [dialog, phase, sceneError, showResults]);
  const touchButton = (
    label: string,
    axis: "steer" | "climb" | "boost" | "brake",
    value: number | boolean,
    content: React.ReactNode,
  ) => (
    <button
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        Object.assign(touch.current, { [axis]: value });
      }}
      onPointerUp={() =>
        Object.assign(touch.current, {
          [axis]: typeof value === "boolean" ? false : 0,
        })
      }
      onPointerCancel={() =>
        Object.assign(touch.current, {
          [axis]: typeof value === "boolean" ? false : 0,
        })
      }
    >
      {content}
    </button>
  );
  const routePercent = Math.min(100, (flight.distance / ROUTE_LENGTH) * 100);
  const environment = getEnvironment(flight.elapsed, { timeMode, weatherMode });
  const routeStop = routeStopAt(flight.distance);
  const routeKm = (ROUTE_LENGTH / 1000).toLocaleString("nb-NO", {
    maximumFractionDigits: 1,
  });
  return (
    <main
      className={`sl-simulator sl-third-person ${className} ${ready ? "is-ready" : "is-active"} ${gentle ? "sl-gentle" : ""}`}
      ref={root}
      tabIndex={-1}
      aria-label="Julius sin sledesimulator"
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse" || stateRef.current.phase !== "flying" || dialog || map || sceneError) return;
        if ((event.target as HTMLElement).closest("button,select,input,.sl-overlay,.sl-map")) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        aimRef.current = pointerAim((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse" || event.button !== 0 || dialog || map || sceneError || stateRef.current.phase !== "flying") return;
        if ((event.target as HTMLElement).closest("button,select,input,.sl-overlay,.sl-map")) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        beginThrow(event.pointerId);
      }}
      onPointerUp={(event) => releaseThrow(event.pointerId)}
      onPointerCancel={() => { chargeRef.current = null; }}
    >
      <canvas
        ref={canvas}
        className="sl-scene"
        aria-label="En tredimensjonal Snøfall-dal med Julius og hjelperen hans i en treslede trukket av tre animerte reinsdyr."
        role="img"
      />
      <div className="sl-shade" />
      {sceneError && (
        <div className="sl-overlay">
          <div
            className="sl-dialog"
            ref={dialogBox}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-label="3D-visningen er avbrutt"
          >
            <span className="sl-eyebrow">3D-VISNINGEN</span>
            <h2>Et lite teknisk pusterom.</h2>
            <p>{sceneError}</p>
            <p>
              Kontroller at WebGL og maskinvareakselerasjon er tilgjengelig i
              nettleseren.
            </p>
          </div>
        </div>
      )}
      <header className="sl-header">
        <button
          className="sl-brand"
          onClick={reset}
          aria-label="Snøfall – tilbake til start"
        >
          <Icon name="snow" size={29} />
          <span>
            SNØFALL<span>EN MAGISK REISE</span>
          </span>
        </button>
        <div className="sl-header-center">
          <span className="sl-status-dot" />
          SLEDEVERKSTEDET <span className="sl-header-slash">/</span> SIMULATOR
          01
        </div>
        <div className="sl-header-tools">
          <button
            className="sl-icon-button"
            onClick={toggleSound}
            aria-label={sound ? "Slå av lyd" : "Slå på lyd"}
            aria-pressed={sound}
          >
            <Icon name={sound ? "sound" : "muted"} />
          </button>
          <span className="sl-tool-divider" />
          <button
            className="sl-icon-button"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Avslutt fullskjerm" : "Åpne fullskjerm"}
          >
            <Icon name="expand" />
          </button>
        </div>
      </header>
      <div
        className="sl-weather"
        aria-label={`${environment.periodLabel}, klokken ${environment.clock}, ${environment.weatherLabel}, ${environment.temperature} grader`}
      >
        <Icon
          name={
            environment.snowfall > 0.25
              ? "snow"
              : environment.night > 0.5
                ? "moon"
                : "sun"
          }
          size={30}
        />
        <div>
          <strong>{environment.temperature}°</strong>
          <span>
            {environment.clock} · {environment.periodLabel.toUpperCase()}
          </span>
          <small className="sl-weather-detail">
            {environment.weatherLabel.toUpperCase()}
            {environment.aurora > 0.25 ? " · NORDLYS" : ""}
          </small>
        </div>
      </div>
      {ready && (
        <section className="sl-intro" aria-labelledby="sl-title">
          <div className="sl-eyebrow">
            <span /> JULIUS SIN SLEDESIMULATOR
          </div>
          <h1 id="sl-title">
            Det er noe
            <br />
            magisk <em>i lufta.</em>
          </h1>
          <p>
            Bli med Julius og hjelperen hans over tretoppene,
            <br className="sl-desktop-break" /> lever gaver til husene, og finn veien
            hjem til Snøfall.
          </p>
          <button
            className="sl-launch"
            onClick={() => {
              launch();
              root.current?.focus();
            }}
          >
            <Icon name="sled" size={24} />
            <span>La eventyret begynne</span>
            <Icon name="arrow" size={22} />
          </button>
          <div className="sl-start-note">
            <span className="sl-status-dot" /> REINSDYRENE ER KLARE. ER DU?
          </div>
          <div className="sl-briefing">
            <div className="sl-portrait">
              <JuliusPortrait />
            </div>
            <div>
              <span>ET LITE RÅD FRA JULIUS</span>
              <blockquote>
                «En god gave fortjener
                <br /> en myk landing.»
              </blockquote>
            </div>
          </div>
        </section>
      )}
      {!ready && (
        <>
          <div className="sl-flight-heading">
            <span className="sl-eyebrow">
              {phase === "paused" ? "ET LITE PUSTEROM" : "REISEN HAR BEGYNT"}
            </span>
            <h2>
              {routeStop.distance === 0 ? "Over tretoppene" : routeStop.name}
            </h2>
            <span className="sl-flight-sub">
              {delivery.deliveries} av {DELIVERY_TARGET_COUNT} hus har fått gaver · Brems for et sikrere kast
            </span>
          </div>
          <div className="sl-flight-status">
            <div>
              <span className="sl-eyebrow">GAVEPOENG</span>
              <strong>{delivery.score.toLocaleString("nb-NO")}<small>poeng</small></strong>
            </div>
            <div>
              <span className="sl-eyebrow">HUS MED GAVER</span>
              <strong>{delivery.deliveries}<small>/ {DELIVERY_TARGET_COUNT}</small></strong>
            </div>
            <div>
              <span className="sl-eyebrow">SLEDENS TILSTAND</span>
              <span
                className="sl-lives"
                aria-label={`${flight.lives} av 3 liv`}
              >
                {[0, 1, 2].map((i) => (
                  <Icon
                    name="sled"
                    key={i}
                    size={25}
                    className={i < flight.lives ? "" : "is-lost"}
                  />
                ))}
              </span>
            </div>
          </div>
          {flying && (
            <button
              className="sl-pause sl-icon-button"
              onClick={pause}
              aria-label="Sett flyturen på pause"
            >
              <Icon name="pause" />
            </button>
          )}
          {flying && (
            <div className="sl-delivery-aim" aria-label="Kastesikte">
              <span className="sl-eyebrow">FORVENTET LANDING</span>
              <strong>{aimView.prediction?.distance == null ? "Sikt mot et merket hus" :
                aimView.prediction.distance < 0.5 ? "Rett på huset" :
                `${Math.round(aimView.prediction.distance)} m fra huset`}</strong>
              <span>{aimView.prediction?.pointsValue ? `${aimView.prediction.pointsValue} mulige poeng` : "Gullmerke = hus som venter på gave"}</span>
              <div className="sl-charge" role="meter" aria-label="Kastestyrke" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(aimView.charge * 100)}>
                <i style={{ width: `${aimView.charge * 100}%` }} />
              </div>
              <small>{aimView.charge > 0 ? "SLIPP FOR Å KASTE" : "SIKT MED MUS / I J K L · HOLD OG SLIPP E / MUSEKNAPP"}</small>
            </div>
          )}
          {phase === "complete" && !showResults && <div className="sl-settling" role="status">De siste gavene er fortsatt i lufta …</div>}
          {flying && (
            <div className="sl-touch-controls" aria-label="Berøringskontroller">
              <div className="sl-dpad">
                {touchButton("Fly høyere", "climb", 1, "↑")}
                {touchButton("Styr til venstre", "steer", -1, "←")}
                {touchButton("Fly lavere", "climb", -1, "↓")}
                {touchButton("Styr til høyre", "steer", 1, "→")}
              </div>
              <div className="sl-touch-delivery">
                <button className="sl-aim-pad" aria-label="Dra for å sikte med pakken"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const bounds = event.currentTarget.getBoundingClientRect();
                    aimRef.current = pointerAim((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
                  }}
                  onPointerMove={(event) => {
                    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    aimRef.current = pointerAim((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
                  }}
                >⌖<small>DRA · SIKT</small></button>
                <button className="sl-throw-button" aria-label="Hold og slipp for å kaste en gave"
                  onPointerDown={(event) => {
                    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); beginThrow(event.pointerId);
                  }}
                  onPointerUp={(event) => releaseThrow(event.pointerId)}
                  onPointerCancel={() => { chargeRef.current = null; }}
                  onClick={(event) => { if (event.detail === 0 && stateRef.current.phase === "flying") throwQueueRef.current = 36; }}
                >{aimView.charge > 0 ? "SLIPP!" : "HOLD · KAST"}</button>
                <div className="sl-touch-speed">
                  {touchButton("Brems", "brake", true, "BREMS")}
                  {touchButton("Øk farten", "boost", true, "FART +")}
                </div>
              </div>
            </div>
          )}
        </>
      )}
      <div className="sl-location">
        <span className="sl-location-mark">✦</span>
        <div>
          <span>DU ER HER</span>
          <strong>{routeStop.name}</strong>
        </div>
        <button
          onClick={() => setMap(!map)}
          aria-expanded={map}
          aria-label="Vis flyruten"
        >
          <Icon name="compass" size={18} />
        </button>
      </div>
      {map && (
        <aside className="sl-map">
          <div className="sl-map-header">
            <span>EN LANG REISE GJENNOM SNØFALL</span>
            <button
              className="sl-icon-button"
              onClick={() => setMap(false)}
              aria-label="Lukk flyruten"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <h3>Gaver til hele dalen.</h3>
          <ol>
            {ROUTE_STOPS.map((stop, i) => (
              <li
                key={stop.distance}
                className={flight.distance >= stop.distance ? "is-visited" : ""}
              >
                <span>
                  {i === ROUTE_STOPS.length - 1 ? (
                    <Icon name="snow" size={13} />
                  ) : (
                    i + 1
                  )}
                </span>
                <div>
                  {stop.name}
                  <small>{stop.description.toUpperCase()}</small>
                </div>
              </li>
            ))}
          </ol>
          <p>
            {routeKm} kilometer · {DELIVERY_TARGET_COUNT} hus · Ca. 5 minutter
          </p>
        </aside>
      )}
      <div className="sl-bottom">
        <div className="sl-wood-rail">
          <i />
          <i />
          <i />
          <i />
          <span>JULIUS · SNØFALL</span>
        </div>
        <div className="sl-cockpit">
          <div className="sl-cockpit-left">
            <div className="sl-ready-light">
              <span className="sl-status-dot" />
              <span>
                {flying
                  ? "ALLE SYSTEMER KLARE"
                  : phase === "paused"
                    ? "SIMULATOR PÅ PAUSE"
                    : phase === "complete"
                      ? "GAVENE LANDER"
                      : "KLAR FOR AVREISE"}
              </span>
            </div>
            <div className="sl-reindeer-status">
              <Icon name="check" size={13} /> TRE REINSDYR. ETT EVENTYR.
            </div>
            <button
              className="sl-text-button"
              onClick={() => openDialog("help")}
            >
              <Icon name="help" size={15} /> Slik flyr du{" "}
              <Icon name="chevron" size={13} />
            </button>
          </div>
          <div className="sl-instruments">
            <Gauge label="FART" value={flight.speed} max={400} unit="km/t" />
            <div className="sl-compass">
              <div className="sl-compass-face">
                <span>N</span>
                <i
                  style={{ transform: `rotate(${flight.heading * 100}deg)` }}
                />
                <small>SNØFALL</small>
              </div>
            </div>
            <Gauge label="HØYDE" value={flight.altitude} max={180} unit="m" />
          </div>
          <div className="sl-cockpit-right">
            <div className="sl-route-label">
              <span>HJEM TIL SNØFALL</span>
              <span>
                {(flight.distance / 1000).toFixed(1).replace(".", ",")}{" "}
                <small>/ {routeKm} KM</small>
              </span>
            </div>
            <div className="sl-progress">
              <span style={{ width: `${routePercent}%` }} />
              <Icon name="snow" size={14} />
            </div>
            <div className="sl-bottom-links">
              <span>FØLGEKAMERA · 3D-SLEDE</span>
              <button
                className="sl-icon-button"
                aria-label="Innstillinger"
                onClick={() => openDialog("settings")}
              >
                <Icon name="settings" size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
      {ready && (
        <div className="sl-key-hint">
          <kbd>W</kbd>
          <span>eller</span>
          <kbd>↑</kbd>
          <span>Det begynner med et lite løft.</span>
        </div>
      )}
      {flying && (
        <div className="sl-key-hint">
          <kbd>W A S D</kbd>
          <span>styr</span>
          <kbd>SHIFT</kbd>
          <span>fart</span>
          <kbd>MELLOMROM</kbd>
          <span>brems</span>
          <kbd>I J K L</kbd>
          <span>sikt</span>
          <kbd>E</kbd>
          <span>hold · kast</span>
          <kbd>P</kbd>
          <span>pause</span>
        </div>
      )}
      <div className={`sl-notice ${notice && phase !== "complete" ? "is-visible" : ""}`} role="status">
        {notice}
      </div>
      {audioError && (
        <div className="sl-audio-error" role="status">
          Lyd kunne ikke startes. Prøv lydknappen igjen.
        </div>
      )}
      {phase === "paused" && !dialog && !sceneError && (
        <div
          className="sl-overlay"
          ref={dialogBox}
          role="dialog"
          aria-modal="true"
          aria-label="Flyturen er på pause"
        >
          <section
            className="sl-dialog sl-pause-dialog"
            aria-label="Flyturen er på pause"
          >
            <Icon name="snow" size={33} />
            <span className="sl-eyebrow">SNØFALL VENTER PÅ DEG</span>
            <h2>Et lite pusterom.</h2>
            <p>
              Reinsdyrene tar en velfortjent pause.
              <br />
              Vi fortsetter når du er klar.
            </p>
            <button
              className="sl-launch"
              onClick={() => {
                resume();
                root.current?.focus();
              }}
            >
              <Icon name="play" />
              <span>Fortsett reisen</span>
              <Icon name="arrow" />
            </button>
            <button className="sl-text-button" onClick={reset}>
              <Icon name="back" size={16} /> Tilbake til verkstedet
            </button>
          </section>
        </div>
      )}
      {showResults && !sceneError && (
        <div
          className="sl-overlay"
          ref={dialogBox}
          role="dialog"
          aria-modal="true"
          aria-label="Flyturen er ferdig"
        >
          <section
            className="sl-dialog sl-pause-dialog"
            aria-label="Flyturen er ferdig"
          >
            <Icon
              name={flight.outcome === "arrived" ? "star" : "sled"}
              size={36}
            />
            <span className="sl-eyebrow">
              {flight.outcome === "arrived"
                ? "VELKOMMEN HJEM"
                : "VI PRØVER IGJEN"}
            </span>
            <h2>
              {flight.outcome === "arrived"
                ? "En magisk reise."
                : "Selv Julius måtte øve."}
            </h2>
            <p>
              {flight.outcome === "arrived"
                ? "Du fant veien tilbake til Snøfall."
                : "Sleden trenger en liten tur innom verkstedet."}
              <br />
              {delivery.deliveries} hus fikk gaver fra {delivery.thrown} kast på {Math.round(flight.elapsed)} sekunder.
            </p>
            <div
              className="sl-result-score"
              aria-label={`${delivery.score} gavepoeng`}
            >
              <strong>{delivery.score.toLocaleString("nb-NO")}</strong>
              <span>gavepoeng</span>
            </div>
            <button
              className="sl-launch"
              onClick={() => {
                launch();
                root.current?.focus();
              }}
            >
              <Icon name="sled" />
              <span>Fly en gang til</span>
              <Icon name="arrow" />
            </button>
            <button className="sl-text-button" onClick={reset}>
              <Icon name="back" size={16} /> Tilbake til verkstedet
            </button>
          </section>
        </div>
      )}
      {dialog && !sceneError && (
        <div
          className="sl-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDialog(null);
          }}
        >
          <div
            className="sl-dialog"
            ref={dialogBox}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sl-dialog-title"
          >
            <button
              className="sl-dialog-close sl-icon-button"
              aria-label="Lukk"
              onClick={() => setDialog(null)}
            >
              <Icon name="close" />
            </button>
            <span className="sl-eyebrow">FRA JULIUS SITT VERKSTED</span>
            <h2 id="sl-dialog-title">
              {dialog === "help"
                ? "Alle kan lære å fly."
                : "Gjør reisen til din."}
            </h2>
            {dialog === "help" ? (
              <>
                <p>
                  Kast gaver til husene med gullmerke. Den buede siktelinjen viser
                  hvor pakken vil lande. Treff huset for 1000 poeng; nærme landinger gir også poeng.
                  Innenfor 10 meter får huset en gave og merket blir grønt.
                  Bare det beste kastet til hvert hus teller.
                </p>
                <div className="sl-controls-list">
                  <div>
                    <span>
                      <kbd>W A S D</kbd> / <kbd>↑ ← ↓ →</kbd>
                    </span>
                    <span>Styr og endre høyde</span>
                  </div>
                  <div>
                    <kbd>MUS</kbd> / <kbd>I J K L</kbd>
                    <span>Sikt til siden og opp eller ned</span>
                  </div>
                  <div>
                    <kbd>E</kbd> / <kbd>MUSEKNAPP</kbd>
                    <span>Hold for mer kraft, slipp for å kaste</span>
                  </div>
                  <div>
                    <kbd>SHIFT</kbd>
                    <span>Gi reinsdyrene litt ekstra fart</span>
                  </div>
                  <div>
                    <kbd>MELLOMROM</kbd>
                    <span>Senk farten</span>
                  </div>
                  <div>
                    <kbd>P</kbd> / <kbd>ESC</kbd>
                    <span>Ta en pause</span>
                  </div>
                </div>
                <p className="sl-small-copy">
                  Pakken arver sledens fart og påvirkes av tyngdekraft og vind.
                  Brems før huset for mer tid til å sikte. På mobil drar du i
                  siktefeltet og holder og slipper kasteknappen. Hold deg over
                  tretoppene og innenfor dalen. Du har tre liv og gaver til hele reisen.
                </p>
                <button
                  className="sl-launch"
                  onClick={() => {
                    setDialog(null);
                    if (stateRef.current.phase === "paused") {
                      resume();
                      root.current?.focus();
                    }
                  }}
                >
                  <span>Det høres magisk ut</span>
                  <Icon name="check" />
                </button>
              </>
            ) : (
              <>
                <p>
                  Litt roligere bevegelser, eller mer vintermagi?
                  <br />
                  Finn stemningen som passer deg.
                </p>
                <label className="sl-setting sl-select-setting">
                  <span>
                    <strong>Tid på døgnet</strong>
                    <small>Se solen gå ned og nordlyset komme frem</small>
                  </span>
                  <select
                    value={timeMode}
                    onChange={(e) => setTimeMode(e.target.value as TimeMode)}
                    aria-label="Tid på døgnet"
                  >
                    <option value="auto">Dag og natt</option>
                    <option value="day">Dag</option>
                    <option value="night">Natt</option>
                  </select>
                </label>
                <label className="sl-setting sl-select-setting">
                  <span>
                    <strong>Vær</strong>
                    <small>Skiftende vintervær gjennom dalen</small>
                  </span>
                  <select
                    value={weatherMode}
                    onChange={(e) =>
                      setWeatherMode(e.target.value as WeatherMode)
                    }
                    aria-label="Vær"
                  >
                    <option value="auto">Skiftende vær</option>
                    <option value="clear">Klart</option>
                    <option value="snow">Snøvær</option>
                    <option value="storm">Snøbyger</option>
                  </select>
                </label>
                <label className="sl-setting">
                  <span>
                    <strong>Rolige bevegelser</strong>
                    <small>Reduserer sledens krenging og vugging</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={gentle}
                    onChange={(e) => setGentle(e.target.checked)}
                  />
                </label>
                <label className="sl-setting">
                  <span>
                    <strong>Vis snøfnugg</strong>
                    <small>Snø og vind følger været på reisen</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={snow}
                    onChange={(e) => setSnow(e.target.checked)}
                  />
                </label>
                <label className="sl-setting">
                  <span>
                    <strong>Lyden av Snøfall</strong>
                    <small>Vind og myke sledebjeller</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={sound}
                    onChange={toggleSound}
                  />
                </label>
                <p className="sl-small-copy">
                  Innstillingene gjelder for denne reisen.
                </p>
                <button className="sl-launch" onClick={() => setDialog(null)}>
                  <span>Tilbake til sleden</span>
                  <Icon name="arrow" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <span className="sl-sr-only" aria-live="polite">
        {showResults
          ? `Flytur ferdig. ${delivery.score} gavepoeng. ${delivery.deliveries} hus fikk gaver.`
          : phase === "paused"
            ? "Flyturen er på pause."
            : phase === "flying"
              ? "Flyturen har begynt. Bruk piltastene eller W A S D."
              : ""}
      </span>
    </main>
  );
}
