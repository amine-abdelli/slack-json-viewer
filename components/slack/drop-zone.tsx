"use client";

import * as React from "react";
import Image from "next/image";
import { Upload, Users } from "lucide-react";

import { GithubLink, ReadmeLink } from "@/components/slack/github-link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DropZoneProps {
  onFiles: (files: File[]) => void;
  error?: string | null;
  directorySize: number;
  directoryName?: string | null;
}

export function DropZone({
  onFiles,
  error,
  directorySize,
  directoryName,
}: DropZoneProps) {
  const [dragging, setDragging] = React.useState(false);
  const conversationInput = React.useRef<HTMLInputElement>(null);
  const directoryInput = React.useRef<HTMLInputElement>(null);

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    onFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <Image
            src="/logo.png"
            alt=""
            width={256}
            height={256}
            priority
            className="mx-auto mb-4 size-12 rounded-[10px]"
          />
          <h1 className="text-2xl font-black tracking-tight">Slack JSON Viewer</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Déposez un export de conversation Slack (.json) pour le relire avec
            l&apos;interface d&apos;origine, puis exportez-le en page HTML autonome.
          </p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => conversationInput.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors",
            dragging
              ? "border-[var(--slack-blue)] bg-[var(--slack-mention-bg)]"
              : "border-border hover:border-[var(--slack-blue)]/60 hover:bg-muted/50"
          )}
        >
          <Upload className="mb-3 size-7 text-muted-foreground" />
          <p className="text-sm font-semibold">
            Glissez-déposez votre fichier ici
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            ou cliquez pour parcourir vos fichiers — .json
          </p>
          <input
            ref={conversationInput}
            type="file"
            accept=".json,application/json"
            multiple
            className="hidden"
            onChange={(e) => {
              onFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>

        {error ? (
          <p
            className="mt-4 rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--slack-red)",
              color: "var(--slack-red)",
            }}
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-3">
            <Users className="size-4 text-muted-foreground" />
            <div className="text-sm">
              <p className="font-medium">Annuaire des utilisateurs</p>
              <p className="text-xs text-muted-foreground">
                {directorySize > 0
                  ? `${directorySize.toLocaleString("fr-FR")} membres chargés${
                      directoryName ? ` · ${directoryName}` : ""
                    }`
                  : "Optionnel — le fichier .txt produit par « slackdump list users »"}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => directoryInput.current?.click()}
          >
            Choisir
          </Button>
          <input
            ref={directoryInput}
            type="file"
            accept=".txt,.tsv,.csv,.json,text/plain"
            className="hidden"
            onChange={(e) => {
              onFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Tout est traité dans votre navigateur : aucun fichier n&apos;est envoyé
          sur un serveur.
        </p>

        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground/70">
          <ReadmeLink className="hover:text-foreground hover:underline" />
          <span aria-hidden="true">·</span>
          <GithubLink className="hover:text-foreground" />
        </div>
      </div>
    </div>
  );
}
