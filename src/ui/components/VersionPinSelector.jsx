import React from 'react';

/**
 * VersionPinSelector — shows a version constraint and the version it resolves to,
 * against the list of available versions.
 *
 * @param {object}   props
 * @param {Array}   [props.versions]   Available versions: string[] or [{version_tag}].
 * @param {string}  [props.constraint] The pin constraint (e.g. '^1.2.0').
 * @param {string|null} [props.resolved] The resolved version, or null if none satisfies.
 * @param {(c:string)=>void} [props.onConstraintChange] Optional editable constraint.
 */
export default function VersionPinSelector({
  versions = [],
  constraint = '',
  resolved = null,
  onConstraintChange,
}) {
  const tags = versions.map((v) => (typeof v === 'string' ? v : v.version_tag));

  return (
    <div className="version-pin" aria-label="Version pin">
      <div className="version-pin-row">
        <label className="field-label" htmlFor="version-constraint">Version Constraint</label>
        {onConstraintChange ? (
          <input
            id="version-constraint"
            className="version-constraint-input"
            type="text"
            value={constraint}
            placeholder="^1.2.0"
            onChange={(e) => onConstraintChange(e.target.value)}
          />
        ) : (
          <code id="version-constraint" className="version-constraint-code">{constraint || '—'}</code>
        )}
      </div>

      <div className="version-pin-resolved">
        <span className="field-label">Resolves To</span>
        {resolved ? (
          <span className="version-resolved-tag">{resolved}</span>
        ) : (
          <span className="version-resolved-none" role="status">No matching version</span>
        )}
      </div>

      {tags.length > 0 && (
        <div className="version-pin-available">
          <span className="field-label">Available</span>
          <ul className="version-list">
            {tags.map((tag) => (
              <li
                key={tag}
                className={`version-list-item ${tag === resolved ? 'version-matched' : ''}`}
                aria-current={tag === resolved ? 'true' : undefined}
              >
                <span className="version-tag">{tag}</span>
                {tag === resolved && <span className="version-matched-label">pinned</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
