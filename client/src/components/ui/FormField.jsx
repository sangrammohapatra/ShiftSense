/**
 * components/ui/FormField.jsx — Reusable labelled input wrapper
 *
 * Renders a label + input + optional error message in the ShiftSense
 * design language. Accepts a react-hook-form registration object via `reg`.
 *
 * Props:
 *   label      {string}   — field label (displayed as small caps)
 *   id         {string}   — input id / htmlFor
 *   reg        {object}   — react-hook-form register() return value
 *   error      {string}   — error message string (from formState.errors)
 *   type       {string}   — input type (default "text")
 *   placeholder{string}
 *   children   {node}     — renders inside the input wrapper (e.g. show/hide button)
 *   disabled   {bool}
 *   className  {string}   — extra classes on the input
 */

const FormField = ({
  label,
  id,
  reg,
  error,
  type = "text",
  placeholder,
  children,
  disabled,
  className = "",
}) => (
  <div>
    <label htmlFor={id} className="ss-label">
      {label}
    </label>
    <div className="relative">
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        className={`ss-input ${error ? "error" : ""} ${children ? "pr-10" : ""} ${className}`}
        {...reg}
      />
      {children && (
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {children}
        </div>
      )}
    </div>
    {error && <p className="ss-field-error">{error}</p>}
  </div>
);

export default FormField;
