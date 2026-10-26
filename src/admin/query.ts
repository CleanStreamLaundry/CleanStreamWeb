import { useEffect, useState } from "react";
import { useAdmin } from "./context";

function sameQueryScope(left: unknown[], right: unknown[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]))
  );
}

export function useQuery<T>(
  fetcher: () => Promise<T>,
  dependencies: unknown[],
  { keepDataOnReload = false }: { keepDataOnReload?: boolean } = {},
) {
  const { identity } = useAdmin();
  const scope = [identity?.id, identity?.role, identity?.portalRole, ...dependencies];
  const [request, setRequest] = useState(() => ({
    scope, fetcher, keepDataOnReload,
  }));
  const [result, setResult] = useState<{
    request: typeof request;
    data: T | null;
    error: string;
  } | null>(null);

  // Reset before children commit; a new account/filter must never paint old data.
  if (
    !sameQueryScope(request.scope, scope) ||
    request.keepDataOnReload !== keepDataOnReload
  ) {
    setRequest({ scope, fetcher, keepDataOnReload });
    setResult(null);
  }

  useEffect(() => {
    if (!request.scope[0]) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      try {
        const data = await request.fetcher();
        if (active) setResult({ request, data, error: "" });
      } catch (e) {
        if (active) {
          setResult((previous) => ({
            request,
            data:
              request.keepDataOnReload && previous &&
              sameQueryScope(previous.request.scope, request.scope)
                ? previous.data : null,
            error: e instanceof Error ? e.message : "Unable to load records.",
          }));
        }
      }
    });
    return () => {
      active = false;
    };
  }, [request]);

  const sameScope = result && sameQueryScope(result.request.scope, scope);
  const complete = sameScope && result.request === request;
  return {
    data: sameScope && (complete || keepDataOnReload) ? result.data : null,
    error: complete ? result.error : "",
    loading: Boolean(identity?.id) && !complete,
    reload: () => setRequest({ scope, fetcher, keepDataOnReload }),
  };
}
