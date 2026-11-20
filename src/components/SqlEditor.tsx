/// <reference types="vite/client" />

import { Component, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Editor, { loader } from "@monaco-editor/react";
import type { OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import "monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker";
import type { Diagnostic, SourceRange } from "../engine/sql/types";

export interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  fontSize: number;
  onCursorChange: (position: { line: number; column: number }) => void;
  onReview: () => void;
  selectedRange?: (SourceRange & { focusEditor?: boolean }) | null;
  diagnostics?: Diagnostic[];
}

const editorEnvironment = globalThis as typeof globalThis & {
  MonacoEnvironment?: { getWorker: () => Worker };
};

editorEnvironment.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// Supplying the imported editor keeps Monaco and its worker in the local build.
loader.config({ monaco });

const themeName = "syntaxlab-dark";
monaco.editor.defineTheme(themeName, {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "keyword", foreground: "7CA5FF" },
    { token: "string", foreground: "A6DBA0" },
    { token: "number", foreground: "F2B572" },
    { token: "comment", foreground: "8490A5", fontStyle: "italic" },
    { token: "delimiter", foreground: "B8C4D9" },
  ],
  colors: {
    "editor.background": "#10151F",
    "editor.foreground": "#E1E7F2",
    "editorLineNumber.foreground": "#687B99",
    "editorLineNumber.activeForeground": "#B3C6E7",
    "editorCursor.foreground": "#8CAFFF",
    "editor.selectionBackground": "#2B4268",
    "editor.inactiveSelectionBackground": "#24334D",
    "editor.lineHighlightBackground": "#161E2B",
    "editor.lineHighlightBorder": "#00000000",
    "editorIndentGuide.background1": "#253044",
    "editorIndentGuide.activeBackground1": "#435779",
    "editorGutter.background": "#10151F",
    "editorWidget.background": "#192231",
    "editorWidget.border": "#33435C",
    focusBorder: "#7CA5FF",
    "scrollbarSlider.background": "#51658350",
    "scrollbarSlider.hoverBackground": "#687E9C80",
    "scrollbarSlider.activeBackground": "#7895BE90",
  },
});

function FallbackEditor({
  value,
  onChange,
  fontSize,
  onCursorChange,
  onReview,
  selectedRange,
}: SqlEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !selectedRange) return;
    if (selectedRange.focusEditor !== false) textarea.focus();
    textarea.setSelectionRange(selectedRange.start, selectedRange.end);
  }, [selectedRange]);
  const updateCursor = (element: HTMLTextAreaElement) => {
    const beforeCursor = element.value.slice(0, element.selectionStart);
    const lines = beforeCursor.split("\n");
    onCursorChange({
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <p
        role="status"
        style={{
          margin: 0,
          padding: "12px 24px",
          color: "#AEBBD0",
          fontSize: 12,
        }}
      >
        El editor avanzado no está disponible. Puedes continuar con el editor
        básico.
      </p>
      <textarea
        ref={textareaRef}
        aria-label="Editor SQL"
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(event) => {
          onChange(event.target.value);
          updateCursor(event.target);
        }}
        onSelect={(event) => updateCursor(event.currentTarget)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            onReview();
          }
        }}
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          resize: "none",
          border: 0,
          padding: 24,
          background: "#10151F",
          color: "#E1E7F2",
          fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
          fontSize,
          lineHeight: 1.65,
          tabSize: 2,
        }}
      />
    </div>
  );
}

class EditorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function SqlEditor(props: SqlEditorProps) {
  const {
    value,
    onChange,
    fontSize,
    onCursorChange,
    onReview,
    selectedRange,
    diagnostics = [],
  } = props;
  const [loadFailed, setLoadFailed] = useState(false);
  const callbacks = useRef({ onCursorChange, onReview });
  const disposables = useRef<monaco.IDisposable[]>([]);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [ready, setReady] = useState(0);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || !selectedRange) return;
    const start = model.getPositionAt(selectedRange.start);
    const end = model.getPositionAt(selectedRange.end);
    editor.setSelection(
      new monaco.Range(
        start.lineNumber,
        start.column,
        end.lineNumber,
        end.column,
      ),
    );
    editor.revealPositionInCenter(start);
    if (selectedRange.focusEditor !== false) editor.focus();
  }, [selectedRange, ready]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      "syntaxlab",
      diagnostics.map((diagnostic) => {
        const start = model.getPositionAt(diagnostic.start);
        const end = model.getPositionAt(
          Math.max(diagnostic.start + 1, diagnostic.end),
        );
        return {
          severity:
            diagnostic.severity === "error"
              ? monaco.MarkerSeverity.Error
              : diagnostic.severity === "warning"
                ? monaco.MarkerSeverity.Warning
                : monaco.MarkerSeverity.Info,
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
          message: `${diagnostic.phase}: ${diagnostic.message}${diagnostic.expected ? ` Se esperaba: ${diagnostic.expected}` : ""}`,
          code: diagnostic.code,
        };
      }),
    );
  }, [diagnostics, ready]);

  useEffect(() => {
    callbacks.current = { onCursorChange, onReview };
  }, [onCursorChange, onReview]);

  useEffect(() => {
    let active = true;
    loader.init().catch(() => {
      if (active) setLoadFailed(true);
    });

    return () => {
      active = false;
      disposables.current.forEach((disposable) => disposable.dispose());
      disposables.current = [];
    };
  }, []);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    setReady((current) => current + 1);
    disposables.current.forEach((disposable) => disposable.dispose());
    disposables.current = [
      editor.onDidChangeCursorPosition(({ position }) => {
        callbacks.current.onCursorChange({
          line: position.lineNumber,
          column: position.column,
        });
      }),
      editor.addAction({
        id: "syntaxlab.review-sql",
        label: "Revisar consulta SQL",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => callbacks.current.onReview(),
      }),
    ];
    const position = editor.getPosition();
    if (position) {
      callbacks.current.onCursorChange({
        line: position.lineNumber,
        column: position.column,
      });
    }
  };

  const fallback = <FallbackEditor {...props} />;

  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        background: "#10151F",
      }}
    >
      <EditorBoundary fallback={fallback}>
        {loadFailed ? (
          fallback
        ) : (
          <Editor
            height="100%"
            language="sql"
            theme={themeName}
            value={value}
            onChange={(nextValue) => onChange(nextValue ?? "")}
            onMount={handleMount}
            loading={
              <span role="status" style={{ color: "#AEBBD0", fontSize: 13 }}>
                Cargando editor…
              </span>
            }
            options={{
              ariaLabel: "Editor SQL",
              accessibilitySupport: "auto",
              editContext: false,
              automaticLayout: true,
              minimap: { enabled: false },
              fontFamily:
                "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
              fontSize,
              lineHeight: Math.round(fontSize * 1.65),
              padding: { top: 24, bottom: 24 },
              lineNumbers: "on",
              lineNumbersMinChars: 3,
              glyphMargin: false,
              folding: false,
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: "smooth",
              renderLineHighlight: "line",
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              tabSize: 2,
              insertSpaces: true,
              autoIndent: "none",
              autoClosingBrackets: "never",
              autoClosingQuotes: "never",
              autoSurround: "never",
              trimAutoWhitespace: false,
              formatOnPaste: false,
              formatOnType: false,
              wordWrap: "off",
              quickSuggestions: false,
              suggestOnTriggerCharacters: false,
              parameterHints: { enabled: false },
              scrollbar: {
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
              },
            }}
          />
        )}
      </EditorBoundary>
    </div>
  );
}
