import { useState } from "react";
import { DEMO_CATALOG, parseCatalog } from "../engine/sql/semantic";
import type { Catalog } from "../engine/sql/types";

export default function CatalogPanel({
  catalog,
  onChange,
}: {
  catalog: Catalog | null;
  onChange: (catalog: Catalog | null) => void;
}) {
  const [text, setText] = useState(() =>
    JSON.stringify(catalog ?? { tables: [], functions: [] }, null, 2),
  );
  const [message, setMessage] = useState("");
  return (
    <details className="catalog-panel module-card">
      <summary>
        Catálogo semántico · {catalog ? "configurado" : "sin configurar"}
      </summary>
      <p>
        JSON explícito. sourceTable establece el contexto de SELECT; tables
        define tablas y columnas; functions define firmas. Tipos admitidos:
        text, number, boolean. No hay conexión a una base de datos.
      </p>
      <label className="form-field">
        Catálogo de símbolos
        <textarea
          aria-label="Catálogo de símbolos JSON"
          className="catalog-editor"
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="module-toolbar">
        <button
          className="primary-button"
          onClick={() => {
            try {
              onChange(parseCatalog(text));
              setMessage(
                "Catálogo aplicado. Se actualizará la semántica del análisis actual.",
              );
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "Catálogo inválido.",
              );
            }
          }}
        >
          Aplicar catálogo
        </button>
        <button
          className="secondary-button"
          onClick={() => {
            setText(JSON.stringify(DEMO_CATALOG, null, 2));
            setMessage(
              "Ejemplo cargado para revisar; pulsa Aplicar catálogo para usarlo.",
            );
          }}
        >
          Cargar catálogo de ejemplo
        </button>
        <button
          className="secondary-button"
          onClick={() => {
            onChange(null);
            setMessage(
              "Catálogo desactivado. Los nombres quedan sin verificar.",
            );
          }}
        >
          Desactivar catálogo
        </button>
      </div>
      {message && (
        <p className="module-feedback" role="status">
          {message}
        </p>
      )}
    </details>
  );
}
