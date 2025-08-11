import React from "react";

export type WorkflowNode = {
  id: string;
  group_url: string;
  group_name: string;
  is_active: boolean;
  prompt?: string;
  keywords?: string[];
};

type Props = {
  title?: string;
  nodes: WorkflowNode[];
  onEdit?: (node: WorkflowNode) => void;
  onDelete?: (node: WorkflowNode) => void;
  onToggle?: (node: WorkflowNode) => void;
  onCreate?: () => void;
};

export default function WorkflowCanvas({
  title = "Fluxo padrão sistema bot",
  nodes,
  onEdit,
  onDelete,
  onToggle,
  onCreate,
}: Props) {
  return (
    <div className="relative w-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {nodes.map((n) => (
          <div
            key={n.id}
            className="relative bg-gray-900 text-white rounded-xl p-4 shadow-md"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-blue-600 grid place-items-center text-white text-sm font-bold">
                f
              </span>
              <span className="font-semibold truncate">{n.group_name}</span>
            </div>
            <div className="text-xs text-gray-300 break-all">
              {n.group_url}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span
                className={
                  "px-2 py-1 text-xs rounded-full " +
                  (n.is_active
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-200 text-gray-700")
                }
              >
                {n.is_active ? "ativo" : "inativo"}
              </span>
              <button
                onClick={() => onToggle && onToggle(n)}
                className="text-xs underline"
              >
                alternar
              </button>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => onEdit && onEdit(n)}
                  className="text-xs underline"
                >
                  editar
                </button>
                <button
                  onClick={() => onDelete && onDelete(n)}
                  className="text-xs underline text-red-500"
                >
                  excluir
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="relative mx-auto mt-8 max-w-md">
        <div className="bg-gray-900 text-white rounded-xl p-5 text-center shadow-md">
          <div className="font-semibold">{title}</div>
          <div className="text-xs opacity-70">n8n, IA, comentários automáticos</div>
        </div>
        <div className="absolute inset-0 pointer-events-none">
          {/* Simple dashed connectors */}
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            {nodes.map((_, idx) => {
              const col = (idx % 3) + 1;
              const row = Math.floor(idx / 3) + 1;
              // crude line positions, good enough for a quick visual like the reference
              const x = col === 1 ? "10%" : col === 2 ? "50%" : "90%";
              const y = row === 1 ? "5%" : "30%";
              return (
                <line
                  key={idx}
                  x1={x}
                  y1={y}
                  x2="50%"
                  y2="85%"
                  strokeDasharray="4 4"
                  stroke="currentColor"
                  className="text-green-600"
                  strokeWidth="2"
                />
              );
            })}
          </svg>
        </div>
        <div className="mt-3 text-center">
          <button
            onClick={() => onCreate && onCreate()}
            className="px-3 py-1 text-sm rounded-lg border hover:bg-gray-50"
          >
            adicionar grupo
          </button>
        </div>
      </div>
    </div>
  );
}