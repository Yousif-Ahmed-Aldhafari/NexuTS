import { siGoogle } from "simple-icons";

import { useI18n } from "@/lib/i18n/use-i18n";
import { SimpleIcon } from "@/components/simple-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function GoogleButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { t } = useI18n();

  return (
    <Button variant="secondary" className={cn(className)} {...props}>
      <SimpleIcon icon={siGoogle} className="size-4" />
      {t("auth.social.google")}
    </Button>
  );
}
