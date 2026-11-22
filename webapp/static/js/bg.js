/* Liquid satin background: flowing ribbons of lavender, coral and peach on black (WebGL).
   Falls back to the CSS gradient on <body> when WebGL is unavailable. */
(function () {
  const canvas = document.getElementById('bg');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) { document.body.classList.add('no-webgl'); return; }

  const vert = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  const frag = `
  precision highp float;
  uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uMood;

  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++){ v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
  }
  vec3 ramp(float x){
    vec3 night = vec3(0.025, 0.014, 0.055), indigo = vec3(0.115, 0.065, 0.290), violet = vec3(0.400, 0.275, 0.790);
    vec3 lav = vec3(0.690, 0.560, 1.000), coral = vec3(1.000, 0.560, 0.650), peach = vec3(1.000, 0.790, 0.570), cream = vec3(1.000, 0.950, 0.820);
    vec3 c = night;
    c = mix(c, indigo, smoothstep(0.10, 0.34, x));
    c = mix(c, violet, smoothstep(0.30, 0.54, x));
    c = mix(c, lav,    smoothstep(0.50, 0.68, x));
    c = mix(c, coral,  smoothstep(0.64, 0.80, x));
    c = mix(c, peach,  smoothstep(0.78, 0.91, x));
    c = mix(c, cream,  smoothstep(0.91, 1.00, x));
    return c;
  }
  void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    vec2 p = uv * vec2(uRes.x / uRes.y, 1.0);
    p += (uMouse - 0.5) * 0.12;
    float t = uTime * 0.05;

    vec2 w = vec2(fbm(p * 1.05 + vec2(0.0, t)), fbm(p * 1.05 + vec2(4.3, -t)));
    // long curved ribbons: one broad glow, then thinner and thinner bright lines riding on it
    float y1 = p.y * 3.0 + 3.2 * w.x + 1.0 * sin(p.x * 1.3 + t * 2.0 + 3.0 * w.y);
    float A = pow(0.5 + 0.5 * sin(y1 * 2.1 + t * 2.0), 2.2);
    float B = pow(0.5 + 0.5 * sin(y1 * 4.6 + 1.3), 5.0);
    float C = pow(0.5 + 0.5 * sin(y1 * 7.4 + 2.1 + w.y * 2.5), 16.0);
    float y2 = p.y * 2.2 - 2.8 * w.y + 1.2 * sin(p.x * 1.0 - t * 1.6 + 1.5);
    float D = pow(0.5 + 0.5 * sin(y2 * 3.6 + 0.7), 6.0);

    float x = A * 0.50 + B * 0.60 + C * 0.55 + D * 0.45;
    // dark pockets between ribbons, like the black gaps in satin
    float gap = smoothstep(0.20, 0.60, fbm(p * 0.9 + vec2(2.0, t * 1.5)));
    x = clamp(x * mix(0.35, 1.05, gap), 0.0, 1.0);

    vec3 col = ramp(x);
    float vig = smoothstep(1.4, 0.2, length(uv - 0.5) * 1.5);
    col *= mix(0.6, 1.0, vig);
    col *= mix(1.0, 0.55, uMood);                       // calmer behind content pages
    gl_FragColor = vec4(col, 1.0);
  }`;

  function compile(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, vert), fs = compile(gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) { document.body.classList.add('no-webgl'); return; }
  const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { document.body.classList.add('no-webgl'); return; }
  gl.useProgram(prog);

  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = { res: gl.getUniformLocation(prog, 'uRes'), time: gl.getUniformLocation(prog, 'uTime'),
              mouse: gl.getUniformLocation(prog, 'uMouse'), mood: gl.getUniformLocation(prog, 'uMood') };

  const SCALE = 0.5;                                    // half resolution is plenty for soft ribbons
  function resize() {
    const w = Math.max(2, Math.floor(window.innerWidth * SCALE)), h = Math.max(2, Math.floor(window.innerHeight * SCALE));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  }
  window.addEventListener('resize', resize); resize();

  let mouse = [0.5, 0.5], target = [0.5, 0.5], mood = 0, moodTarget = 0, running = true, t0 = performance.now();
  window.addEventListener('pointermove', (e) => { target = [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight]; }, { passive: true });
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running && !reduce) requestAnimationFrame(frame); });

  function draw(now) {
    mouse[0] += (target[0] - mouse[0]) * 0.04; mouse[1] += (target[1] - mouse[1]) * 0.04;
    mood += (moodTarget - mood) * 0.06;
    gl.uniform2f(U.res, canvas.width, canvas.height);
    gl.uniform1f(U.time, (now - t0) / 1000 + 12.0);
    gl.uniform2f(U.mouse, mouse[0], mouse[1]);
    gl.uniform1f(U.mood, mood);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function frame(now) {
    if (!running) return;
    draw(now);
    if (!reduce || Math.abs(moodTarget - mood) > 0.01) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.ExoBG = { setMood(v) { moodTarget = v; if (reduce) requestAnimationFrame(frame); } };
})();
