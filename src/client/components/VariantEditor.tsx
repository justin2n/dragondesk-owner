import React, { useRef, useEffect } from 'react';
import styles from './VariantEditor.module.css';

interface VariantEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const VariantEditor: React.FC<VariantEditorProps> = ({ value, onChange, placeholder }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = React.useState<'visual' | 'html'>('visual');

  useEffect(() => {
    if (editorRef.current && mode === 'visual') {
      editorRef.current.innerHTML = value;
    }
  }, [value, mode]);

  const executeCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    updateContent();
  };

  const updateContent = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const insertLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      executeCommand('createLink', url);
    }
  };

  const insertImage = () => {
    const url = prompt('Enter image URL:');
    if (url) {
      executeCommand('insertImage', url);
    }
  };

  const changeFontSize = (size: string) => {
    executeCommand('fontSize', size);
  };

  const changeTextColor = (color: string) => {
    executeCommand('foreColor', color);
  };

  const changeBackgroundColor = (color: string) => {
    executeCommand('backColor', color);
  };

  const toggleMode = () => {
    if (mode === 'visual' && editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
    setMode(mode === 'visual' ? 'html' : 'visual');
  };

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <button
            type="button"
            onClick={toggleMode}
            className={styles.modeToggle}
            title={mode === 'visual' ? 'Switch to HTML' : 'Switch to Visual'}
          >
            {mode === 'visual' ? '< />' : '👁️'}
          </button>
        </div>

        {mode === 'visual' && (
          <>
            <div className={styles.toolbarGroup}>
              <button
                type="button"
                onClick={() => executeCommand('bold')}
                className={styles.toolBtn}
                title="Bold"
              >
                <strong>B</strong>
              </button>
              <button
                type="button"
                onClick={() => executeCommand('italic')}
                className={styles.toolBtn}
                title="Italic"
              >
                <em>I</em>
              </button>
              <button
                type="button"
                onClick={() => executeCommand('underline')}
                className={styles.toolBtn}
                title="Underline"
              >
                <u>U</u>
              </button>
              <button
                type="button"
                onClick={() => executeCommand('strikeThrough')}
                className={styles.toolBtn}
                title="Strikethrough"
              >
                <s>S</s>
              </button>
            </div>

            <div className={styles.toolbarGroup}>
              <select
                onChange={(e) => changeFontSize(e.target.value)}
                className={styles.select}
                defaultValue="3"
              >
                <option value="1">Small</option>
                <option value="3">Normal</option>
                <option value="5">Large</option>
                <option value="7">Huge</option>
              </select>
            </div>

            <div className={styles.toolbarGroup}>
              <input
                type="color"
                onChange={(e) => changeTextColor(e.target.value)}
                className={styles.colorPicker}
                title="Text Color"
              />
              <input
                type="color"
                onChange={(e) => changeBackgroundColor(e.target.value)}
                className={styles.colorPicker}
                title="Background Color"
              />
            </div>

            <div className={styles.toolbarGroup}>
              <button
                type="button"
                onClick={() => executeCommand('justifyLeft')}
                className={styles.toolBtn}
                title="Align Left"
              >
                ≡
              </button>
              <button
                type="button"
                onClick={() => executeCommand('justifyCenter')}
                className={styles.toolBtn}
                title="Align Center"
              >
                ≡
              </button>
              <button
                type="button"
                onClick={() => executeCommand('justifyRight')}
                className={styles.toolBtn}
                title="Align Right"
              >
                ≡
              </button>
            </div>

            <div className={styles.toolbarGroup}>
              <button
                type="button"
                onClick={() => executeCommand('insertUnorderedList')}
                className={styles.toolBtn}
                title="Bullet List"
              >
                • List
              </button>
              <button
                type="button"
                onClick={() => executeCommand('insertOrderedList')}
                className={styles.toolBtn}
                title="Numbered List"
              >
                1. List
              </button>
            </div>

            <div className={styles.toolbarGroup}>
              <button
                type="button"
                onClick={insertLink}
                className={styles.toolBtn}
                title="Insert Link"
              >
                🔗
              </button>
              <button
                type="button"
                onClick={insertImage}
                className={styles.toolBtn}
                title="Insert Image"
              >
                🖼️
              </button>
            </div>
          </>
        )}
      </div>

      {mode === 'visual' ? (
        <div
          ref={editorRef}
          contentEditable
          onInput={updateContent}
          onBlur={updateContent}
          className={styles.editor}
          data-placeholder={placeholder}
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={styles.htmlEditor}
          placeholder={placeholder}
        />
      )}
    </div>
  );
};

export default VariantEditor;
