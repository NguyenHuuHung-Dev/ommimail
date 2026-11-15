# Interactive landing spheres

The Three.js physical materials, lighting arrangement and mass-weighted sphere
collisions are adapted from the `main.js` the user supplied in the
`infinity-ribbon` archive, associated with their CodePen reference:
https://codepen.io/editor/Abdughafur-Khujzoda/pen/01a1a59a-ef98-76f4-bbb3-1ecefb3bf32f

The integration uses Three.js 0.160.0, matching the supplied HTML import map.
It is bundled locally and loaded on demand when Home mounts. It does not load
CodePen, fonts, scripts or runtime assets from that reference site.

`BubbleScene` owns the accessible button, formation selection, visibility and
React lifecycle. `bubble-webgl` owns the GPU scene, materials, room environment,
pointer raycasting, spring motion and collision separation. Resource disposal
includes geometry, materials, environment, shadow maps and the WebGL renderer.

The pink palette, white CONNECT lettering, scoped canvas and existing mailbox
search belong to OmniMail. The reference's full-screen loader, scroll hijacking,
theme drawer and heart formation are not part of this integration. Clicking
cycles cloud → orbit → flower. Motion pauses offscreen/in a hidden tab; reduced
motion renders static formations. A CSS illustration keeps the hero usable when
WebGL is unavailable.
