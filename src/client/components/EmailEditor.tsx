import React, { useRef, useEffect, useState } from 'react';
import { useToast } from './Toast';
import styles from './EmailEditor.module.css';

interface EmailEditorProps {
  value: string;
  onChange: (html: string) => void;
}

const EmailEditor: React.FC<EmailEditorProps> = ({ value, onChange }) => {
  const { toast } = useToast();
  const editorRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'visual' | 'html'>('visual');

  useEffect(() => {
    if (editorRef.current && viewMode === 'visual') {
      editorRef.current.innerHTML = value;
    }
  }, [value, viewMode]);

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
    // Create file input for image upload
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Create FormData for upload
      const formData = new FormData();
      formData.append('image', file);

      try {
        const response = await fetch('http://localhost:5000/api/templates/upload-image', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        const data = await response.json();
        const imageUrl = `http://localhost:5000${data.url}`;
        executeCommand('insertImage', imageUrl);
      } catch (error) {
        console.error('Error uploading image:', error);
        toast('Failed to upload image', 'error');
      }
    };

    input.click();
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

  const handleHTMLChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className={styles.emailEditor}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <button
            type="button"
            onClick={() => setViewMode('visual')}
            className={`${styles.toolBtn} ${viewMode === 'visual' ? styles.active : ''}`}
            title="Visual Editor"
          >
            Visual
          </button>
          <button
            type="button"
            onClick={() => setViewMode('html')}
            className={`${styles.toolBtn} ${viewMode === 'html' ? styles.active : ''}`}
            title="HTML Editor"
          >
            HTML
          </button>
        </div>

        {viewMode === 'visual' && (
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
                className={styles.toolSelect}
                defaultValue=""
              >
                <option value="" disabled>
                  Size
                </option>
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
                ⋮
              </button>
              <button
                type="button"
                onClick={() => executeCommand('insertOrderedList')}
                className={styles.toolBtn}
                title="Numbered List"
              >
                ≡
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
                🖼
              </button>
            </div>

            <div className={styles.toolbarGroup}>
              <button
                type="button"
                onClick={() => executeCommand('removeFormat')}
                className={styles.toolBtn}
                title="Clear Formatting"
              >
                ✕
              </button>
            </div>
          </>
        )}
      </div>

      {viewMode === 'visual' ? (
        <div
          ref={editorRef}
          contentEditable
          className={styles.editor}
          onInput={updateContent}
          onBlur={updateContent}
        />
      ) : (
        <textarea
          value={value}
          onChange={handleHTMLChange}
          className={styles.htmlEditor}
          spellCheck={false}
        />
      )}

      <div className={styles.emailPreview}>
        <div className={styles.previewHeader}>Email Preview</div>
        <div
          className={styles.previewContent}
          dangerouslySetInnerHTML={{ __html: value }}
        />
      </div>
    </div>
  );
};

export default EmailEditor;
