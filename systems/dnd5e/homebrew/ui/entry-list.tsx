import { useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@skald/sheet-sdk/components/ui/alert-dialog";

type Props = {
  name: string;
  /** `class` and `subclass` rows are stored with their features. */
  kind: string;
  /** Feature rows stored with a class or subclass. */
  features: number;
  /** Subclasses (in any own pack) whose parent this class is: they stay, orphaned. */
  subclasses: string[];
  deleting: boolean;
  open: (() => void) | null;
  remove(): void;
};

/** One entry in the pack's item list: open it, see what it counts as, delete it after a styled confirm. */
export function EntryRow({ name, kind, features, subclasses, deleting, open, remove }: Props) {
  const t = useTranslations("homebrew");
  const multi = kind === "class" || kind === "subclass";
  return (
    <div className="flex items-center justify-between gap-1" aria-busy={deleting || undefined} data-entry-row>
      <button type="button" className="min-w-0 text-left" disabled={!open || deleting} onClick={() => open?.()}>
        {name}
      </button>
      {multi && (
        <span className="ml-1 mr-auto text-xs text-muted-foreground" data-feature-count>
          {t(`${kind as "class" | "subclass"}.features`, { count: features, total: features + 1 })}
        </span>
      )}
      {deleting ? (
        <span role="status" className="text-xs text-muted-foreground">
          {t("deleting")}
        </span>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost">
              {t("delete")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteTitle", { name })}</AlertDialogTitle>
              <AlertDialogDescription>
                {multi ? t(`${kind as "class" | "subclass"}.confirmDelete`, { name, count: features }) : t("confirm", { name })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {kind === "class" && subclasses.length > 0 && (
              <div className="space-y-1 text-sm" data-kept-subclasses>
                <p>{t("class.keepSubclasses")}</p>
                <ul className="list-disc pl-5">
                  {subclasses.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={remove}>{t("delete")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
