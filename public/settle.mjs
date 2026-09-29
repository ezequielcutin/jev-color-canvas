// Collapsing an ambiguous scene by touch. Pure, so it runs in the browser
// (served from public/) and in Node tests.
//
// The pick pass renders the scene once with each pixel encoding what it shows:
//   bgMask   1 where the scene shows its background, 0 where its foreground
//   bgRival  1 where the background is showing its runner-up colour
//   fgRival  1 where the foreground is showing its runner-up colour
// decideSettle turns the sample under the finger into "this role goes to that
// colour". The action says what the tap did, so the UI never goes quiet:
//   settle  the vote was split; `to` is 0 (first choice) or 1 (runner-up)
//   sure    Jev had no real runner-up for that role, so there is nothing to pick
//   done    the user already settled that role

const ROLES = ["background", "foreground"];

// share:   [background, foreground] runner-up shares (0 = Jev was sure)
// settled: [background, foreground] true once the user has already chosen
export function decideSettle(sample, { share, settled }) {
  const role = sample.bgMask > 0.5 ? 0 : 1;
  const name = ROLES[role];
  if (settled[role]) return { role, name, action: "done" };
  if (!(share[role] > 0)) return { role, name, action: "sure" };
  const rival = role === 0 ? sample.bgRival : sample.fgRival;
  return { role, name, action: "settle", to: rival > 0.5 ? 1 : 0 };
}
