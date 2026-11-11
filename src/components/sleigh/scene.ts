import { STAR_GATES, type FlightState } from "./flight";
import {
  identity,
  lookAt,
  multiply,
  part,
  perspective,
  STRIDE,
  transform,
  type Mat4,
  type ModelPart,
  type Vec3,
} from "./geometry";
import { createSleighRig, createStar } from "./models";
import { createWorld } from "./world";
import { cameraPose } from "./camera";

export interface SceneOptions {
  snow: boolean;
  gentle: boolean;
}
type GpuMesh = { buffer: WebGLBuffer; count: number };
import {
  VERTEX,
  FRAGMENT,
  DEPTH_VERTEX,
  DEPTH_FRAGMENT,
  SKY_VERTEX,
  SKY_FRAGMENT,
  SNOW_VERTEX,
  SNOW_FRAGMENT,
  GLOW_VERTEX,
  GLOW_FRAGMENT,
} from "./shaders";
type ForestGpu = {
  mesh: Float32Array;
  data: Float32Array;
  buffer: WebGLBuffer;
  count: number;
};

/** A real, depth-tested WebGL world with a third-person camera and articulated models. */
export class SleighScene {
  private gl: WebGLRenderingContext;
  private program!: WebGLProgram;
  private depthProgram!: WebGLProgram;
  private depthAttribute = 0;
  private depthModel: WebGLUniformLocation | null = null;
  private depthLight: WebGLUniformLocation | null = null;
  private shadowFrame: WebGLFramebuffer | null = null;
  private shadowTexture: WebGLTexture | null = null;
  private shadowDepth: WebGLRenderbuffer | null = null;
  private attributesInfo: { index: number; size: number; offset: number }[] =
    [];
  private uniforms!: Record<
    | "model"
    | "view"
    | "viewProjection"
    | "lantern"
    | "light"
    | "shadowMap"
    | "camera"
    | "localMaterial",
    WebGLUniformLocation | null
  >;
  private skyAttribute = 0;
  private snowAttribute = 0;
  private snowUniforms!: Record<
    "viewProjection" | "origin" | "time" | "travel" | "pixelRatio",
    WebGLUniformLocation | null
  >;
  private skyProgram!: WebGLProgram;
  private snowProgram!: WebGLProgram;
  private skyBuffer!: WebGLBuffer;
  private snowBuffer!: WebGLBuffer;
  private meshes = new Map<Float32Array, GpuMesh>();
  private data = createWorld();
  private world = this.data.mesh;
  private forest: ForestGpu[] = [];
  private instancing: ANGLE_instanced_arrays | null = null;
  private forestAttributes!: {
    position: number;
    angle: number;
    enabled: WebGLUniformLocation | null;
  };
  private depthForestAttributes!: {
    position: number;
    angle: number;
    enabled: WebGLUniformLocation | null;
  };
  private glowProgram!: WebGLProgram;
  private glowBuffer!: WebGLBuffer;
  private glowAttribute = 0;
  private glowView: WebGLUniformLocation | null = null;
  private glowRatio: WebGLUniformLocation | null = null;
  private skyHorizon: WebGLUniformLocation | null = null;
  private warmLightLocation: WebGLUniformLocation | null = null;
  private warmLightData = new Float32Array(24);
  private rig = createSleighRig();
  private starMesh = createStar();
  private stars = STAR_GATES.map((gate) =>
    part(this.starMesh, [gate.x, gate.altitude, -gate.distance]),
  );
  private camera: Vec3 = [12, 48, 32];
  private width = 1;
  private height = 1;
  private ratio = 1;
  private lastTime = 0;
  private lastDistance = -1;
  private previousFlight: FlightState | null = null;
  private lost = false;
  error = "";
  private disposed = false;
  private onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
  };
  private onRestored = () => {
    if (!this.disposed) {
      this.meshes.clear();
      try {
        this.initialise();
        this.lost = false;
        this.error = "";
      } catch (error) {
        this.lost = true;
        this.error =
          error instanceof Error
            ? error.message
            : "3D-visningen kunne ikke gjenopprettes.";
        this.releaseResources();
      }
    }
  };

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: true,
      powerPreference: "high-performance",
    });
    if (!gl)
      throw new Error(
        "Nettleseren kunne ikke starte WebGL. Prøv en nettleser med maskinvareakselerasjon.",
      );
    this.gl = gl;
    try {
      this.initialise();
    } catch (error) {
      this.releaseResources();
      throw error;
    }
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
  }
  private createProgram(vertex: string, fragment: string) {
    const gl = this.gl,
      program = gl.createProgram()!;
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        gl.deleteProgram(program);
        throw new Error(`3D-shaderen kunne ikke startes: ${error}`);
      }
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`3D-visningen kunne ikke startes: ${error}`);
    }
    return program;
  }
  private upload(data: Float32Array): GpuMesh {
    let mesh = this.meshes.get(data);
    if (mesh) return mesh;
    const buffer = this.gl.createBuffer()!;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
    mesh = { buffer, count: data.length / STRIDE };
    this.meshes.set(data, mesh);
    return mesh;
  }
  private initialise() {
    const gl = this.gl;
    this.program = this.createProgram(VERTEX, FRAGMENT);
    this.depthProgram = this.createProgram(DEPTH_VERTEX, DEPTH_FRAGMENT);
    this.depthAttribute = gl.getAttribLocation(this.depthProgram, "aPosition");
    this.depthModel = gl.getUniformLocation(this.depthProgram, "uModel");
    this.depthLight = gl.getUniformLocation(this.depthProgram, "uLight");
    this.instancing = gl.getExtension("ANGLE_instanced_arrays");
    this.forestAttributes = {
      position: gl.getAttribLocation(this.program, "aInstance"),
      angle: gl.getAttribLocation(this.program, "aAngle"),
      enabled: gl.getUniformLocation(this.program, "uInstanced"),
    };
    this.depthForestAttributes = {
      position: gl.getAttribLocation(this.depthProgram, "aInstance"),
      angle: gl.getAttribLocation(this.depthProgram, "aAngle"),
      enabled: gl.getUniformLocation(this.depthProgram, "uInstanced"),
    };
    this.forest = this.data.treeMeshes.map((mesh) => {
      const buffer = gl.createBuffer()!,
        data = new Float32Array(this.data.trees.length);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
      this.upload(mesh);
      return { mesh, buffer, data, count: 0 };
    });
    this.shadowTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1024,
      1024,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowFrame = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFrame);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.shadowTexture,
      0,
    );
    this.shadowDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.shadowDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 1024, 1024);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER,
      this.shadowDepth,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error("Grafikkortet kunne ikke opprette 3D-skyggene.");
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.skyProgram = this.createProgram(SKY_VERTEX, SKY_FRAGMENT);
    this.snowProgram = this.createProgram(SNOW_VERTEX, SNOW_FRAGMENT);
    this.glowProgram = this.createProgram(GLOW_VERTEX, GLOW_FRAGMENT);
    this.glowAttribute = gl.getAttribLocation(this.glowProgram, "aGlow");
    this.glowView = gl.getUniformLocation(this.glowProgram, "uViewProjection");
    this.glowRatio = gl.getUniformLocation(this.glowProgram, "uPixelRatio");
    this.skyHorizon = gl.getUniformLocation(this.skyProgram, "uHorizon");
    this.glowBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glowBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.lights, gl.STATIC_DRAW);
    this.skyBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const seeds = new Float32Array(450 * 3);
    for (let i = 0; i < seeds.length; i++)
      seeds[i] = (((Math.sin(i * 127.1 + 3) * 43758.5453) % 1) + 1) % 1;
    this.snowBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.snowBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    this.attributesInfo = [
      ["aPosition", 3, 0],
      ["aNormal", 3, 3],
      ["aColour", 3, 6],
      ["aEmission", 1, 9],
    ].map(([name, size, offset]) => ({
      index: gl.getAttribLocation(this.program, String(name)),
      size: Number(size),
      offset: Number(offset),
    }));
    this.uniforms = {
      model: gl.getUniformLocation(this.program, "uModel"),
      view: gl.getUniformLocation(this.program, "uView"),
      viewProjection: gl.getUniformLocation(this.program, "uViewProjection"),
      lantern: gl.getUniformLocation(this.program, "uLantern"),
      camera: gl.getUniformLocation(this.program, "uCamera"),
      localMaterial: gl.getUniformLocation(this.program, "uLocalMaterial"),
      light: gl.getUniformLocation(this.program, "uLight"),
      shadowMap: gl.getUniformLocation(this.program, "uShadowMap"),
    };
    this.warmLightLocation = gl.getUniformLocation(
      this.program,
      "uWarmLights[0]",
    );
    this.skyAttribute = gl.getAttribLocation(this.skyProgram, "aPosition");
    this.snowAttribute = gl.getAttribLocation(this.snowProgram, "aSeed");
    this.snowUniforms = {
      viewProjection: gl.getUniformLocation(
        this.snowProgram,
        "uViewProjection",
      ),
      origin: gl.getUniformLocation(this.snowProgram, "uOrigin"),
      time: gl.getUniformLocation(this.snowProgram, "uTime"),
      travel: gl.getUniformLocation(this.snowProgram, "uTravel"),
      pixelRatio: gl.getUniformLocation(this.snowProgram, "uPixelRatio"),
    };
    this.upload(this.world);
    this.upload(this.starMesh);
    const visit = (node: ModelPart) => {
      if (node.mesh) this.upload(node.mesh);
      node.children.forEach(visit);
    };
    visit(this.rig.root);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
  }
  resize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.ratio = Math.min(
      window.devicePixelRatio || 1,
      width < 650 ? 1.35 : 1.6,
    );
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }
  private attributes(mesh: GpuMesh) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
    for (const { index, size, offset } of this.attributesInfo) {
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(
        index,
        size,
        gl.FLOAT,
        false,
        STRIDE * 4,
        offset * 4,
      );
    }
  }
  private drawMesh(
    mesh: Float32Array,
    model: Mat4,
    shadow = false,
    localMaterial = false,
  ) {
    const gl = this.gl,
      gpu = this.upload(mesh);
    gl.uniform1i(
      shadow
        ? this.depthForestAttributes.enabled
        : this.forestAttributes.enabled,
      0,
    );
    if (shadow) {
      gl.bindBuffer(gl.ARRAY_BUFFER, gpu.buffer);
      gl.enableVertexAttribArray(this.depthAttribute);
      gl.vertexAttribPointer(
        this.depthAttribute,
        3,
        gl.FLOAT,
        false,
        STRIDE * 4,
        0,
      );
      gl.uniformMatrix4fv(this.depthModel, false, model);
    } else {
      gl.uniform1i(this.uniforms.localMaterial, localMaterial ? 1 : 0);
      this.attributes(gpu);
      gl.uniformMatrix4fv(this.uniforms.model, false, model);
    }
    gl.drawArrays(gl.TRIANGLES, 0, gpu.count);
  }
  private drawPart(
    node: ModelPart,
    parent: Mat4,
    shadow = false,
    localMaterial = false,
  ) {
    const model = multiply(parent, transform(node.position, node.rotation));
    if (node.mesh) this.drawMesh(node.mesh, model, shadow, localMaterial);
    for (const child of node.children)
      this.drawPart(child, model, shadow, localMaterial);
  }
  private prepareForest(state: FlightState) {
    for (const batch of this.forest) batch.count = 0;
    const source = this.data.trees,
      maxDistance = this.width < 650 ? 1450 : 2000;
    for (let i = 0; i < source.length; i += 6) {
      const forward = -source[i + 2] - state.distance;
      if (forward < -65 || forward > maxDistance) continue;
      const distance = Math.hypot(source[i] - state.x, forward);
      if (distance > maxDistance) continue;
      const lod =
        distance < (this.width < 650 ? 58 : 75)
          ? 0
          : distance < (this.width < 650 ? 180 : 235)
            ? 1
            : distance < (this.width < 650 ? 370 : 560)
              ? 2
              : 3;
      const batch = this.forest[lod * 2 + source[i + 5]];
      const offset = batch.count++ * 5;
      for (let j = 0; j < 5; j++) batch.data[offset + j] = source[i + j];
    }
    const gl = this.gl;
    for (const batch of this.forest) {
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
      if (batch.count)
        gl.bufferSubData(
          gl.ARRAY_BUFFER,
          0,
          batch.data.subarray(0, batch.count * 5),
        );
    }
  }
  private drawForest(shadow = false) {
    const gl = this.gl,
      locations = shadow ? this.depthForestAttributes : this.forestAttributes;
    for (let index = 0; index < this.forest.length; index++) {
      const batch = this.forest[index];
      if (!batch.count || (shadow && index >= 4)) continue;
      if (!this.instancing) {
        const limit = Math.min(batch.count, index >= 4 ? 160 : batch.count);
        for (let i = 0; i < limit; i++) {
          const d = batch.data,
            o = i * 5;
          this.drawMesh(
            batch.mesh,
            transform(
              [d[o], d[o + 1], d[o + 2]],
              [0, d[o + 4], 0],
              [d[o + 3], d[o + 3], d[o + 3]],
            ),
            shadow,
          );
        }
        continue;
      }
      const gpu = this.upload(batch.mesh);
      gl.uniform1i(locations.enabled, 1);
      if (shadow) {
        gl.bindBuffer(gl.ARRAY_BUFFER, gpu.buffer);
        gl.enableVertexAttribArray(this.depthAttribute);
        gl.vertexAttribPointer(
          this.depthAttribute,
          3,
          gl.FLOAT,
          false,
          STRIDE * 4,
          0,
        );
        gl.uniformMatrix4fv(this.depthModel, false, identity());
      } else {
        this.attributes(gpu);
        gl.uniformMatrix4fv(this.uniforms.model, false, identity());
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
      gl.enableVertexAttribArray(locations.position);
      gl.vertexAttribPointer(locations.position, 4, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(locations.angle);
      gl.vertexAttribPointer(locations.angle, 1, gl.FLOAT, false, 20, 16);
      this.instancing.vertexAttribDivisorANGLE(locations.position, 1);
      this.instancing.vertexAttribDivisorANGLE(locations.angle, 1);
      this.instancing.drawArraysInstancedANGLE(
        gl.TRIANGLES,
        0,
        gpu.count,
        batch.count,
      );
      this.instancing.vertexAttribDivisorANGLE(locations.position, 0);
      this.instancing.vertexAttribDivisorANGLE(locations.angle, 0);
      gl.disableVertexAttribArray(locations.position);
      gl.disableVertexAttribArray(locations.angle);
    }
    gl.uniform1i(locations.enabled, 0);
  }
  draw(state: FlightState, time: number, options: SceneOptions) {
    if (this.lost || this.disposed) return;
    const gl = this.gl,
      dt = Math.max(0, Math.min(0.1, time - this.lastTime));
    this.lastTime = time;
    const narrow = this.width < 650;
    const restarted =
      this.lastDistance < 0 || state.distance < this.lastDistance;
    const pose = cameraPose(state, narrow, restarted ? null : this.camera, dt);
    this.camera = pose.eye;
    this.lastDistance = state.distance;
    const target = pose.target;
    const view = lookAt(this.camera, target),
      projection = perspective(
        ((narrow ? 64 : 59) * Math.PI) / 180,
        this.width / this.height,
        0.4,
        6000,
      );
    projection[8] = pose.shift;
    const viewProjection = multiply(projection, view);
    const ortho = new Float32Array([
      1 / 150,
      0,
      0,
      0,
      0,
      1 / 150,
      0,
      0,
      0,
      0,
      -2 / 499,
      0,
      0,
      0,
      -501 / 499,
      1,
    ]);
    const light = multiply(
      ortho,
      lookAt(
        [state.x - 110, 180, -state.distance + 85],
        [state.x, 0, -state.distance - 35],
      ),
    );
    const previous = this.previousFlight;
    const moving =
      state.phase === "flying" &&
      !restarted &&
      previous &&
      previous.phase !== "ready" &&
      previous.lives === state.lives &&
      dt > 0;
    const movement = {
      lateralVelocity: moving ? (state.x - previous.x) / dt : 0,
      verticalVelocity: moving ? (state.altitude - previous.altitude) / dt : 0,
      forwardAcceleration: moving
        ? (state.speed - previous.speed) / (3.6 * dt)
        : 0,
    };
    if (restarted || (state.phase === "ready" && previous?.phase !== "ready"))
      this.rig.reset(time);
    this.previousFlight = state;
    this.prepareForest(state);
    this.rig.root.position = [state.x, state.altitude, -state.distance];
    this.rig.update(
      time,
      state.speed,
      state.heading,
      state.phase !== "ready",
      options.gentle,
      movement,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFrame);
    gl.disable(gl.DITHER);
    gl.viewport(0, 0, 1024, 1024);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    gl.useProgram(this.depthProgram);
    gl.uniformMatrix4fv(this.depthLight, false, light);
    this.drawMesh(this.world, identity(), true);
    this.drawForest(true);
    this.drawPart(this.rig.root, identity(), true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.DITHER);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.5, 0.65, 0.75, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    gl.useProgram(this.skyProgram);
    const horizontal = Math.hypot(
      this.camera[0] - target[0],
      this.camera[2] - target[2],
    );
    gl.uniform1f(
      this.skyHorizon,
      0.5 +
        (this.camera[1] - target[1]) /
          Math.max(1, horizontal) /
          (2 * Math.tan(((narrow ? 64 : 59) * Math.PI) / 360)),
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuffer);
    const skyPosition = this.skyAttribute;
    gl.enableVertexAttribArray(skyPosition);
    gl.vertexAttribPointer(skyPosition, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.viewProjection, false, viewProjection);
    gl.uniformMatrix4fv(this.uniforms.view, false, view);
    gl.uniform3fv(this.uniforms.camera, this.camera);
    gl.uniformMatrix4fv(this.uniforms.light, false, light);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
    gl.uniform1i(this.uniforms.shadowMap, 0);
    gl.uniform3fv(this.uniforms.lantern, [
      state.x + 4,
      state.altitude + 7,
      -state.distance + 5,
    ]);
    const lights = this.data.lights;
    const closest: Array<{ offset: number; distance: number }> = [];
    for (let i = 0; i < lights.length; i += 4) {
      const distance =
        (lights[i] - state.x) ** 2 +
        (lights[i + 1] - state.altitude * 0.3) ** 2 +
        (lights[i + 2] + state.distance) ** 2;
      closest.push({ offset: i, distance });
    }
    closest.sort((a, b) => a.distance - b.distance);
    for (let i = 0; i < 6; i++) {
      const source = closest[i]?.offset;
      if (source === undefined) {
        this.warmLightData.fill(0, i * 4, i * 4 + 4);
        continue;
      }
      for (let j = 0; j < 4; j++)
        this.warmLightData[i * 4 + j] = lights[source + j];
    }
    gl.uniform4fv(this.warmLightLocation, this.warmLightData);
    this.drawMesh(this.world, identity());
    this.drawForest();
    this.drawPart(this.rig.root, identity(), false, true);
    if (state.phase !== "ready" && state.nextGate < this.stars.length) {
      const star = this.stars[state.nextGate];
      star.rotation[2] = Math.sin(time * 0.8) * 0.06;
      this.drawPart(star, identity());
    }
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    gl.useProgram(this.glowProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glowBuffer);
    gl.enableVertexAttribArray(this.glowAttribute);
    gl.vertexAttribPointer(this.glowAttribute, 4, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(this.glowView, false, viewProjection);
    gl.uniform1f(this.glowRatio, this.ratio);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, this.data.lights.length / 4);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    if (options.snow) {
      for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
      gl.useProgram(this.snowProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.snowBuffer);
      const seed = this.snowAttribute;
      gl.enableVertexAttribArray(seed);
      gl.vertexAttribPointer(seed, 3, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(
        this.snowUniforms.viewProjection,
        false,
        viewProjection,
      );
      gl.uniform3fv(this.snowUniforms.origin, [
        state.x,
        state.altitude,
        -state.distance,
      ]);
      gl.uniform1f(this.snowUniforms.time, time);
      gl.uniform1f(this.snowUniforms.travel, state.distance);
      gl.uniform1f(this.snowUniforms.pixelRatio, this.ratio);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.drawArrays(gl.POINTS, 0, 450);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  }
  private releaseResources() {
    const gl = this.gl;
    for (const mesh of this.meshes.values()) gl.deleteBuffer(mesh.buffer);
    this.meshes.clear();
    for (const batch of this.forest) gl.deleteBuffer(batch.buffer);
    this.forest = [];
    if (this.glowBuffer) gl.deleteBuffer(this.glowBuffer);
    if (this.glowProgram) gl.deleteProgram(this.glowProgram);
    if (this.skyBuffer) gl.deleteBuffer(this.skyBuffer);
    if (this.snowBuffer) gl.deleteBuffer(this.snowBuffer);
    if (this.program) gl.deleteProgram(this.program);
    if (this.depthProgram) gl.deleteProgram(this.depthProgram);
    gl.deleteTexture(this.shadowTexture);
    gl.deleteFramebuffer(this.shadowFrame);
    gl.deleteRenderbuffer(this.shadowDepth);
    if (this.skyProgram) gl.deleteProgram(this.skyProgram);
    if (this.snowProgram) gl.deleteProgram(this.snowProgram);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseResources();
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
  }
}
