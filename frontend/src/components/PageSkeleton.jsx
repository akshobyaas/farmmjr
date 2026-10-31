// Modern-UI polish pass: replaces .loading-screen's old bare "Loading…"
// pulse-fade text with a shimmering placeholder shape -- the shape of a
// generic card/list page (an icon circle + two text lines, then two
// wider content blocks), since every call site here is a full-page load
// before real content/cards exist. role="status" preserves the same
// assistive-tech announcement the plain text gave (aria-live polite via
// the implicit status role), just with a different visual.
// `inline`: a page like ProfilePage already renders its own AppHeader +
// BottomNav shell and only needs the skeleton shape inside its existing
// <main>, not another full-viewport wrapper nested inside a flex parent
// (which would blow out the page height) -- see PageSkeleton.test.jsx.
export default function PageSkeleton({ label = "Loading", inline = false }) {
  const card = (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton-row">
        <div className="skeleton-circle" />
        <div className="skeleton-lines">
          <span className="skeleton-line skeleton-line-wide" />
          <span className="skeleton-line skeleton-line-narrow" />
        </div>
      </div>
      <span className="skeleton-block" />
      <span className="skeleton-block skeleton-block-short" />
    </div>
  );

  if (inline) {
    return (
      <div className="skeleton-inline" role="status" aria-label={label}>
        {card}
      </div>
    );
  }

  return (
    <div className="loading-screen" role="status" aria-label={label}>
      {card}
    </div>
  );
}
