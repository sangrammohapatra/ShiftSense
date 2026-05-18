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

import { InputAdornment, TextField, Typography } from "@mui/material";
const FormField = ({
  label,
  id,
  reg,
  error,
  type = "text",
  placeholder,
  disabled,
  endAdornment,
  helperText,
  select = false,
  children,
  sx,
  textFieldProps,
  inputProps,
  multiline = false,
  rows,
}) => {
  const { ref, ...fieldProps } = reg ?? {};

  return (
    <>
      <Typography
        variant="overline"
        htmlFor={id}
        sx={{
          display: "block",
          fontFamily: '"IBM Plex Mono", monospace',
        }}
      >
        {label}
      </Typography>
      <TextField
        id={id}
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        error={Boolean(error)}
        helperText={error || helperText || " "}
        fullWidth
        select={select}
        multiline={multiline}
        rows={rows}
        inputRef={ref}
        inputProps={inputProps}
        {...fieldProps}
        {...textFieldProps}
        InputProps={{
          endAdornment: endAdornment ? (
            <InputAdornment position="end">{endAdornment}</InputAdornment>
          ) : undefined,
          ...textFieldProps?.InputProps,
        }}
        InputLabelProps={{
          shrink: true,
          ...textFieldProps?.InputLabelProps,
        }}
        sx={{
          "& .MuiInputLabel-root": {
            fontFamily: '"IBM Plex Mono", monospace',
            letterSpacing: "0.08em",
          },
          "& .MuiInputBase-root": {
            borderRadius: 2.5,
          },
          "& .MuiFormHelperText-root": {
            ml: 0,
            fontFamily: '"IBM Plex Mono", monospace',
          },
          ...sx,
        }}
      >
        {children}
      </TextField>
    </>
  );
};

export default FormField;
