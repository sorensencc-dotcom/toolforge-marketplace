import React from 'react';
import RatingStars from './RatingStars.jsx';

/**
 * RelatedSkills — "Similar skills" grid (up to 5) with name, category, avg rating.
 *
 * @param {object}   props
 * @param {number|string} props.skillId  The skill these relate to (excluded from list).
 * @param {Array}   [props.skills]        Skill[] with {rating:{average,count}, category}.
 * @param {(id)=>void} [props.onSelect]   Navigate to skill detail.
 */
export default function RelatedSkills({ skillId, skills = [], onSelect }) {
  const items = skills.filter((s) => String(s.id) !== String(skillId)).slice(0, 5);

  if (!items.length) return null;

  return (
    <section className="related-skills" aria-labelledby="related-heading">
      <h2 id="related-heading" className="section-heading">Similar Skills</h2>
      <ul className="related-grid">
        {items.map((skill) => {
          const rating = skill.rating || { average: 0, count: 0 };
          return (
            <li key={skill.id} className="related-card">
              <button
                type="button"
                className="related-card-btn"
                onClick={() => onSelect && onSelect(skill.id)}
                aria-label={`${skill.name}, ${skill.category}, rated ${Number(rating.average || 0).toFixed(1)} out of 5`}
              >
                <h3 className="related-name">{skill.name}</h3>
                <span className="category-badge">{skill.category}</span>
                <div className="related-rating">
                  <RatingStars value={rating.average} size="sm" />
                  <span className="related-rating-value">
                    {rating.average ? Number(rating.average).toFixed(1) : 'N/A'}
                    <span className="related-rating-count"> ({rating.count})</span>
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
