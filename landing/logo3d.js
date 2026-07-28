/* Alacrán — WebGL scorpion emblem, built with Three.js.
   Progressive enhancement: if WebGL or Three.js is unavailable (or errors),
   the SVG scorpion in the same wrapper is revealed instead. */
(function () {
  var wrap = document.getElementById("logo3d-wrap");
  if (!wrap) return;
  var canvas = wrap.querySelector(".logo3d");
  var fallback = wrap.querySelector(".logo3d-fallback");

  function showFallback() {
    if (canvas) canvas.style.display = "none";
    if (fallback) fallback.style.display = "block";
  }

  var THREE = window.THREE;
  if (!THREE || !canvas) { showFallback(); return; }

  // Probe WebGL on a throwaway canvas so Three.js can create the real
  // context itself (a context, once created, ignores later attributes).
  var probe;
  try { var tc = document.createElement("canvas"); probe = tc.getContext("webgl2") || tc.getContext("webgl"); } catch (e) {}
  if (!probe) { showFallback(); return; }

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var renderer, scene, camera, group, raf = 0, t0 = 0;

  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 7.2);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0x2a0d10, 1.0));
    var key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2.5, 3.5, 4); scene.add(key);
    var rim = new THREE.PointLight(0xff2e43, 6.0, 22); rim.position.set(-3, 1.6, 2.6); scene.add(rim);
    var warm = new THREE.PointLight(0xff6b35, 2.2, 22); warm.position.set(3, -2, 3); scene.add(warm);

    var mat = new THREE.MeshStandardMaterial({
      color: 0xff2e43, metalness: 0.55, roughness: 0.32,
      emissive: 0x5c0710, emissiveIntensity: 0.55
    });

    group = new THREE.Group();

    // ---- tail: chain of tapering spheres along a curled curve ----
    var curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3( 0.05, -1.15,  0.00),
      new THREE.Vector3( 0.95, -0.65,  0.05),
      new THREE.Vector3( 1.55,  0.15,  0.00),
      new THREE.Vector3( 1.60,  1.00, -0.05),
      new THREE.Vector3( 1.05,  1.70,  0.00),
      new THREE.Vector3( 0.15,  1.92,  0.05),
      new THREE.Vector3(-0.55,  1.55,  0.00)
    ]);
    var N = 11;
    for (var i = 0; i <= N; i++) {
      var p = curve.getPoint(i / N);
      var r = Math.max(0.30 - 0.014 * i, 0.11);
      var s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 20), mat);
      s.position.copy(p);
      group.add(s);
    }
    // telson bulb + stinger cone at the tail tip
    var tip = curve.getPoint(1);
    var dir = tip.clone().sub(curve.getPoint(0.9)).normalize();
    var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 20), mat);
    bulb.position.copy(tip); group.add(bulb);
    var sting = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 20), mat);
    sting.position.copy(tip.clone().add(dir.clone().multiplyScalar(0.3)));
    sting.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    group.add(sting);

    // ---- body: segmented abdomen tapering into the head ----
    var bodySegs = [
      [ 0.00, -1.20, 0.0, 0.34],
      [-0.15, -1.62, 0.0, 0.30],
      [-0.28, -2.00, 0.0, 0.25],
      [-0.40, -2.34, 0.0, 0.21]
    ];
    for (var b = 0; b < bodySegs.length; b++) {
      var g = bodySegs[b];
      var m = new THREE.Mesh(new THREE.SphereGeometry(g[3], 24, 20), mat);
      m.position.set(g[0], g[1], g[2]);
      m.scale.set(1.15, 0.85, 1.0);
      group.add(m);
    }

    // ---- pincers: two arms with open claws reaching forward ----
    function pincer(sign) {
      var pg = new THREE.Group();
      var arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 6, 12), mat);
      arm.position.set(sign * 0.42, -2.5, 0.05);
      arm.rotation.z = sign * 0.7;
      pg.add(arm);
      var claw = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.075, 12, 22, Math.PI * 1.35), mat);
      claw.position.set(sign * 0.82, -2.92, 0.05);
      claw.rotation.z = sign * 0.4 + (sign > 0 ? Math.PI * 0.15 : Math.PI * 0.85);
      pg.add(claw);
      return pg;
    }
    group.add(pincer(1));
    group.add(pincer(-1));

    group.scale.setScalar(0.6);
    group.position.y = 0.18;
    group.rotation.x = -0.1;
    scene.add(group);

    function resize() {
      var w = wrap.clientWidth || 180, h = wrap.clientHeight || 180;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    function render(t) {
      if (!t0) t0 = t;
      var e = (t - t0) / 1000;
      group.rotation.y = reduce ? 0.4 : Math.sin(e * 0.6) * 0.55;
      group.position.y = 0.18 + (reduce ? 0 : Math.sin(e * 0.9) * 0.05);
      renderer.render(scene, camera);
      raf = reduce ? 0 : requestAnimationFrame(render);
    }
    raf = requestAnimationFrame(render);

    // pause the loop while the emblem is scrolled off-screen
    if (!reduce && "IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        en.forEach(function (x) {
          if (x.isIntersecting && !raf) { t0 = 0; raf = requestAnimationFrame(render); }
          else if (!x.isIntersecting && raf) { cancelAnimationFrame(raf); raf = 0; }
        });
      }, { threshold: 0.05 }).observe(wrap);
    }
  } catch (err) {
    if (raf) cancelAnimationFrame(raf);
    showFallback();
  }
})();
