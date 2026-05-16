/**
 * hooks/useApi.js — Generic axios call hook with built-in toast error handling
 *
 * Wraps any async API function with:
 *   - loading state
 *   - error state
 *   - automatic react-hot-toast on error
 *   - optional success toast
 *   - optional onSuccess / onError callbacks
 *
 * Returns { data, loading, error, execute } where execute() triggers the call.
 *
 * Usage examples:
 *
 *   // Basic — fires on button click
 *   const { loading, execute } = useApi(
 *     () => api.post("/workers/link", { phone_number }),
 *     { successMessage: "Worker linked!" }
 *   );
 *   <button onClick={execute} disabled={loading}>Link</button>
 *
 *   // With data — fires on mount
 *   const { data, loading } = useApi(
 *     () => api.get("/dashboard/stats"),
 *     { immediate: true }
 *   );
 *
 *   // With callbacks
 *   const { execute } = useApi(
 *     () => api.patch("/auth/me", formData),
 *     {
 *       onSuccess: (data) => navigate("/dashboard"),
 *       onError:   (err)  => console.error(err),
 *     }
 *   );
 *
 * NOTE: For data fetching with caching, prefer TanStack React Query (useQuery).
 * useApi is intended for one-shot mutations and imperative calls that need
 * loading/error state without a query cache (e.g. form submissions, actions).
 *
 * @param {() => Promise<import("axios").AxiosResponse>} apiFn
 *   An async function that returns an Axios response.
 *
 * @param {object} [options]
 * @param {boolean}  [options.immediate=false]    — call apiFn immediately on mount
 * @param {string}   [options.successMessage]     — toast shown on success (optional)
 * @param {string}   [options.errorMessage]       — override toast message on error
 * @param {boolean}  [options.silent=false]       — suppress error toast entirely
 * @param {Function} [options.onSuccess]          — callback(data) on success
 * @param {Function} [options.onError]            — callback(error) on error
 * @param {Function} [options.transform]          — transform(response) before storing data
 *
 * @returns {{ data: any, loading: boolean, error: Error|null, execute: Function }}
 */

import { useState, useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";

const useApi = (apiFn, options = {}) => {
  const {
    immediate      = false,
    successMessage = null,
    errorMessage   = null,
    silent         = false,
    onSuccess      = null,
    onError        = null,
    transform      = null,
  } = options;

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(immediate);  // true from start if immediate
  const [error,   setError]   = useState(null);

  // Track mounted state to prevent state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /**
   * Executes the API call.
   * Accepts optional args that are forwarded to apiFn — useful when the
   * function signature needs parameters decided at call-time rather than
   * hook-init-time.
   *
   * @param {...any} args  — forwarded to apiFn(...args)
   * @returns {Promise<any>} — the transformed response data, or null on error
   */
  const execute = useCallback(async (...args) => {
    if (!mountedRef.current) return null;

    setLoading(true);
    setError(null);

    try {
      const response = await apiFn(...args);

      // Extract data from Axios response envelope
      // Handles both raw Axios responses ({ data: { data: ... } })
      // and pre-unwrapped values
      const raw        = response?.data?.data ?? response?.data ?? response;
      const result     = transform ? transform(raw) : raw;

      if (mountedRef.current) {
        setData(result);

        if (successMessage) {
          toast.success(successMessage);
        }

        onSuccess?.(result);
      }

      return result;
    } catch (err) {
      if (!mountedRef.current) return null;

      setError(err);

      if (!silent) {
        // Prefer the server's message (normalised by the axios interceptor),
        // then the caller's override, then a generic fallback
        const msg =
          errorMessage ||
          err.message  ||
          "Something went wrong. Please try again.";

        toast.error(msg, {
          // Give the user a bit more time to read error messages
          duration: 5000,
        });
      }

      onError?.(err);
      return null;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [apiFn, successMessage, errorMessage, silent, onSuccess, onError, transform]);

  // Fire immediately on mount if requested
  useEffect(() => {
    if (immediate) {
      execute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — only fires on mount

  /**
   * Resets state back to initial values.
   * Useful for form reset flows where you want to clear a previous error/result.
   */
  const reset = useCallback(() => {
    setData(null);
    setLoading(false);
    setError(null);
  }, []);

  return { data, loading, error, execute, reset };
};

export default useApi;
