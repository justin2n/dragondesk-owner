import React, { useRef, useState, useEffect } from 'react';
import styles from './VisualPageEditor.module.css';

interface VisualPageEditorProps {
  pageUrl: string;
  variant: any;
  onChange: (changes: any) => void;
  variantLabel: string;
}

interface ElementChange {
  selector: string;
  type: 'text' | 'image' | 'style' | 'attribute';
  property?: string;
  oldValue: string;
  newValue: string;
}

const VisualPageEditor: React.FC<VisualPageEditorProps> = ({
  pageUrl,
  variant,
  onChange,
  variantLabel,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [editMode, setEditMode] = useState<'select' | 'edit'>('select');
  const [changes, setChanges] = useState<ElementChange[]>(variant?.changes || []);
  const [hoveredSelector, setHoveredSelector] = useState<string | null>(null);

  // Editor state
  const [editValue, setEditValue] = useState('');
  const [editType, setEditType] = useState<'text' | 'image' | 'style'>('text');
  const [styleProperty, setStyleProperty] = useState('');

  useEffect(() => {
    if (iframeRef.current) {
      const iframe = iframeRef.current;

      iframe.onload = () => {
        setIsLoading(false);
        try {
          injectEditorScript();
        } catch (err: any) {
          if (err.name === 'SecurityError') {
            setError('Cannot edit this page due to browser security restrictions (CORS). The page must be on the same domain or allow cross-origin access.');
          } else {
            setError(`Error loading page: ${err.message}`);
          }
        }
      };

      iframe.onerror = () => {
        setError('Failed to load the page. Please check the URL and ensure the page allows embedding.');
        setIsLoading(false);
      };
    }
  }, [pageUrl]);

  const injectEditorScript = () => {
    if (!iframeRef.current) return;

    const iframeDoc = iframeRef.current.contentDocument;
    if (!iframeDoc) {
      throw new Error('Cannot access iframe content. Page must allow embedding, be served from the same domain, or use a CORS proxy.');
    }

    // Inject CSS for hover highlighting
    const style = iframeDoc.createElement('style');
    style.textContent = `
      .dojo-editor-highlight {
        outline: 2px dashed #dc2626 !important;
        outline-offset: 2px !important;
        cursor: pointer !important;
        position: relative !important;
      }
      .dojo-editor-selected {
        outline: 3px solid #dc2626 !important;
        outline-offset: 2px !important;
        background: rgba(220, 38, 38, 0.1) !important;
      }
      .dojo-editor-label {
        position: absolute;
        top: -24px;
        left: 0;
        background: #dc2626;
        color: white;
        padding: 2px 8px;
        font-size: 11px;
        font-weight: bold;
        border-radius: 3px;
        z-index: 999999;
        font-family: system-ui;
      }
    `;
    iframeDoc.head.appendChild(style);

    // Make elements selectable
    const interactiveElements = iframeDoc.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, p, a, button, img, span, div[class*="hero"], div[class*="cta"], div[class*="heading"]'
    );

    interactiveElements.forEach((element: any) => {
      element.addEventListener('mouseenter', () => {
        if (editMode === 'select') {
          element.classList.add('dojo-editor-highlight');
          const selector = generateSelector(element);
          setHoveredSelector(selector);
        }
      });

      element.addEventListener('mouseleave', () => {
        element.classList.remove('dojo-editor-highlight');
        setHoveredSelector(null);
      });

      element.addEventListener('click', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        if (editMode === 'select') {
          handleElementClick(element);
        }
      });
    });

    // Apply existing changes
    applyChanges(iframeDoc);
  };

  const generateSelector = (element: Element): string => {
    // Generate a unique CSS selector for the element
    if (element.id) {
      return `#${element.id}`;
    }

    let selector = element.tagName.toLowerCase();
    if (element.className) {
      const classes = element.className.split(' ').filter(c => !c.startsWith('dojo-editor'));
      if (classes.length > 0) {
        selector += '.' + classes.join('.');
      }
    }

    // Add nth-child if needed for uniqueness
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === element.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(element) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    return selector;
  };

  const handleElementClick = (element: Element) => {
    const selector = generateSelector(element);
    const tagName = element.tagName.toLowerCase();

    let value = '';
    let type: 'text' | 'image' | 'style' = 'text';

    if (tagName === 'img') {
      value = (element as HTMLImageElement).src;
      type = 'image';
    } else {
      value = element.textContent || '';
      type = 'text';
    }

    setSelectedElement({
      element,
      selector,
      tagName,
      originalValue: value,
    });
    setEditValue(value);
    setEditType(type);
    setEditMode('edit');

    // Highlight selected element
    if (iframeRef.current?.contentDocument) {
      const allElements = iframeRef.current.contentDocument.querySelectorAll('.dojo-editor-selected');
      allElements.forEach((el) => el.classList.remove('dojo-editor-selected'));
      element.classList.add('dojo-editor-selected');
    }
  };

  const handleSaveChange = () => {
    if (!selectedElement) return;

    const newChange: ElementChange = {
      selector: selectedElement.selector,
      type: editType,
      property: editType === 'style' ? styleProperty : undefined,
      oldValue: selectedElement.originalValue,
      newValue: editValue,
    };

    const updatedChanges = [
      ...changes.filter((c) => c.selector !== selectedElement.selector),
      newChange,
    ];

    setChanges(updatedChanges);
    onChange({ ...variant, changes: updatedChanges });

    // Apply the change immediately
    if (iframeRef.current?.contentDocument) {
      applyChange(iframeRef.current.contentDocument, newChange);
    }

    setEditMode('select');
    setSelectedElement(null);
  };

  const applyChanges = (doc: Document) => {
    changes.forEach((change) => applyChange(doc, change));
  };

  const applyChange = (doc: Document, change: ElementChange) => {
    try {
      const element = doc.querySelector(change.selector);
      if (!element) return;

      if (change.type === 'text') {
        element.textContent = change.newValue;
      } else if (change.type === 'image' && element instanceof HTMLImageElement) {
        element.src = change.newValue;
      } else if (change.type === 'style' && change.property) {
        (element as HTMLElement).style.setProperty(change.property, change.newValue);
      }
    } catch (err) {
      console.error('Error applying change:', err);
    }
  };

  const handleCancelEdit = () => {
    setEditMode('select');
    setSelectedElement(null);
    if (iframeRef.current?.contentDocument) {
      const allElements = iframeRef.current.contentDocument.querySelectorAll('.dojo-editor-selected');
      allElements.forEach((el) => el.classList.remove('dojo-editor-selected'));
    }
  };

  const handleResetChanges = () => {
    if (confirm('Reset all changes for this variant?')) {
      setChanges([]);
      onChange({ ...variant, changes: [] });
      if (iframeRef.current) {
        iframeRef.current.src = `/api/proxy?url=${encodeURIComponent(pageUrl)}`; // Reload iframe
      }
    }
  };

  if (error) {
    return (
      <div className={styles.error}>
        <h3>⚠️ Unable to Load Page for Visual Editing</h3>
        <p>{error}</p>
        <div className={styles.errorHelp}>
          <strong>Why this happens:</strong>
          <p style={{ marginBottom: '1rem', color: 'var(--color-text-secondary)' }}>
            Most external websites block embedding in iframes for security reasons (X-Frame-Options, CSP policies).
            This is a browser security feature that prevents cross-origin access.
          </p>

          <strong>Recommended Solutions:</strong>
          <ul>
            <li><strong>Test on your own website:</strong> The visual editor works best with pages on your own domain that you control</li>
            <li><strong>Development/Staging environment:</strong> Use a staging or local version of the page you want to test</li>
            <li><strong>CORS Proxy:</strong> Set up a CORS proxy server to load external pages (for testing purposes only)</li>
            <li><strong>Alternative workflow:</strong> Document desired changes in the test notes and apply them manually to your live site</li>
          </ul>

          <strong style={{ marginTop: '1rem', display: 'block' }}>Try the Visual Editor:</strong>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Use our test page to see the visual editor in action:
            <br />
            <code style={{ background: 'var(--color-dark-grey)', padding: '0.25rem 0.5rem', borderRadius: '4px', marginTop: '0.5rem', display: 'inline-block' }}>
              http://localhost:3000/test-page.html
            </code>
            <br />
            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
              (This page is served from the same domain, so editing will work)
            </span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h3>{variantLabel}</h3>
          <span className={styles.url}>{pageUrl}</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.changeCount}>
            {changes.length} {changes.length === 1 ? 'change' : 'changes'}
          </span>
          {changes.length > 0 && (
            <button onClick={handleResetChanges} className={styles.resetBtn}>
              Reset All
            </button>
          )}
        </div>
      </div>

      {editMode === 'edit' && selectedElement && (
        <div className={styles.editPanel}>
          <div className={styles.editHeader}>
            <h4>Editing: {selectedElement.tagName}</h4>
            <button onClick={handleCancelEdit} className={styles.closeBtn}>
              ✕
            </button>
          </div>

          <div className={styles.editBody}>
            <div className={styles.formGroup}>
              <label>Selector</label>
              <input
                type="text"
                value={selectedElement.selector}
                disabled
                className={styles.input}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Edit Type</label>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value as any)}
                className={styles.select}
              >
                <option value="text">Text Content</option>
                {selectedElement.tagName === 'img' && <option value="image">Image URL</option>}
                <option value="style">CSS Style</option>
              </select>
            </div>

            {editType === 'style' && (
              <div className={styles.formGroup}>
                <label>CSS Property</label>
                <select
                  value={styleProperty}
                  onChange={(e) => setStyleProperty(e.target.value)}
                  className={styles.select}
                >
                  <option value="">Select property...</option>
                  <option value="color">Text Color</option>
                  <option value="background-color">Background Color</option>
                  <option value="font-size">Font Size</option>
                  <option value="font-weight">Font Weight</option>
                  <option value="display">Display</option>
                  <option value="visibility">Visibility</option>
                </select>
              </div>
            )}

            <div className={styles.formGroup}>
              <label>
                {editType === 'text' ? 'Text Content' : editType === 'image' ? 'Image URL' : 'CSS Value'}
              </label>
              {editType === 'text' ? (
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className={styles.textarea}
                  rows={4}
                />
              ) : (
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className={styles.input}
                />
              )}
            </div>

            <div className={styles.editActions}>
              <button onClick={handleCancelEdit} className={styles.cancelBtn}>
                Cancel
              </button>
              <button onClick={handleSaveChange} className={styles.saveBtn}>
                Save Change
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.editorContainer}>
        {isLoading && (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>Loading page...</p>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={`/api/proxy?url=${encodeURIComponent(pageUrl)}`}
          className={styles.iframe}
          title={`${variantLabel} Preview`}
        />

        {editMode === 'select' && (
          <div className={styles.instructions}>
            <p>👆 Click on any text, image, or button to edit it</p>
            {hoveredSelector && (
              <span className={styles.hoveredInfo}>Hovering: {hoveredSelector}</span>
            )}
          </div>
        )}
      </div>

      {changes.length > 0 && (
        <div className={styles.changesList}>
          <h4>Changes Made:</h4>
          <ul>
            {changes.map((change, index) => (
              <li key={index}>
                <strong>{change.selector}</strong>
                <span className={styles.changeType}>{change.type}</span>
                <span className={styles.changeValue}>
                  {change.newValue.substring(0, 50)}
                  {change.newValue.length > 50 ? '...' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default VisualPageEditor;
