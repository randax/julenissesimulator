import { createWorld, type WorldData } from "./world.ts";

type Chunk = { data: WorldData; detailed: boolean };

/** Retain only visible chunks; detailed villages are never repeated into other sections. */
export class WorldStream {
  private chunks = new Map<number, Chunk>();
  private visible = new Set<number>();
  private detailed = new Set<number>();

  private release: (mesh: Float32Array) => void;
  private generate: typeof createWorld;

  constructor(release: (mesh: Float32Array) => void, generate = createWorld) {
    this.release = release;
    this.generate = generate;
  }

  beginFrame() {
    this.visible.clear();
    this.detailed.clear();
  }

  get(tile: number, detailed = false): WorldData {
    this.visible.add(tile);
    if (detailed) this.detailed.add(tile);
    let chunk = this.chunks.get(tile);
    if (!chunk || (detailed && !chunk.detailed)) {
      if (chunk) this.discard(chunk.data);
      chunk = { data: this.generate(tile, detailed ? "full" : "far"), detailed };
      this.chunks.set(tile, chunk);
    }
    return chunk.data;
  }

  hasDetailed(tile: number) {
    return this.chunks.get(tile)?.detailed === true;
  }

  /** Adopt a background-built section only when it is actually needed by this frame. */
  provide(tile: number, data: WorldData) {
    const previous = this.chunks.get(tile);
    if (previous?.detailed) return;
    if (previous) this.discard(previous.data);
    this.chunks.set(tile, { data, detailed: true });
  }

  endFrame() {
    for (const [tile, chunk] of this.chunks) {
      if (!this.visible.has(tile)) {
        this.discard(chunk.data);
        this.chunks.delete(tile);
      } else if (chunk.detailed && !this.detailed.has(tile)) {
        // Keep an already generated horizon mesh, releasing the village and forest data.
        if (chunk.data.mesh !== chunk.data.farMesh) this.release(chunk.data.mesh);
        chunk.data = {
          ...chunk.data,
          mesh: chunk.data.farMesh,
          trees: new Float32Array(),
          lights: new Float32Array(),
        };
        chunk.detailed = false;
      }
    }
  }

  clear() {
    for (const chunk of this.chunks.values()) this.discard(chunk.data);
    this.chunks.clear();
    this.visible.clear();
    this.detailed.clear();
  }

  private discard(data: WorldData) {
    for (const mesh of new Set([data.mesh, data.farMesh])) this.release(mesh);
  }
}
