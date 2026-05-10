import { useState } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { helpTopics } from './helpContent.js';

export default function HelpModal({ user, onClose }) {
  const [expanded, setExpanded] = useState(null);

  const visibleTopics = helpTopics.filter(topic => {
    if (topic.minRole === 'superadmin') return user.is_superadmin;
    if (topic.minRole === 'admin') return user.is_admin;
    return true;
  });

  const toggle = (id) => setExpanded(prev => prev === id ? null : id);

  return (
    <div className="modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">HELP</h2>
          <button className="btn-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="help-topics">
          {visibleTopics.map(topic => (
            <div key={topic.id} className="help-topic">
              <button className="help-topic-header" onClick={() => toggle(topic.id)}>
                <span className="help-topic-emoji">{topic.emoji}</span>
                <span className="help-topic-title">{topic.title}</span>
                {expanded === topic.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              {expanded === topic.id && (
                <div className="help-topic-body">
                  {topic.content.map((block, i) => renderBlock(block, i))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function renderBlock(block, key) {
  if (block.type === 'p') return <p key={key} className="help-p">{block.text}</p>;
  if (block.type === 'bullets') return (
    <ul key={key} className="help-bullets">
      {block.items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
  if (block.type === 'tip') return (
    <div key={key} className="help-tip">{block.text}</div>
  );
  return null;
}
