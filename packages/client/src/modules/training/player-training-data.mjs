export function trainingAttributeDetails(player, keys, labels) {
  return keys.map((key) => {
    const band = player?.assessment?.bands?.[key];
    if (!band || !Number.isFinite(band.min) || !Number.isFinite(band.max))
      return { key, label: labels[key] ?? key, value: '待观察', observed: false, exact: false };
    const exact = band.min === band.max;
    return {
      key,
      label: labels[key] ?? key,
      value: exact ? String(band.min) : `${band.min}–${band.max}`,
      observed: true,
      exact,
    };
  });
}

export function trainingFitness(value) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}
