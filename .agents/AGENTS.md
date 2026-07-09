# YSACC Company Web UI & Component Design System Rules

To maintain YSACC brand identity and consistency across all trading management modules, any future code generator or developer must strictly adhere to the styling specifications detailed below.

## 1. Typography & Font Specifications
- **Input Labels**:
  - `fontSize: '11px'` (strictly enforced)
  - `fontWeight: 750`
  - `color: '#475569'` (Slate grey)
  - `letterSpacing: '0.02em'`
  - `textTransform: 'uppercase'` (Uppercase transform)
  - Required fields markers must use red asterisk `*` in color `#ef4444`.
- **Form Section Headers**:
  - `fontSize: '13.5px'`
  - `fontWeight: 800`
  - `color: '#1e293b'` (Slate dark)
- **Table Headers (th)**:
  - `fontSize: '12.5px'`
  - `fontWeight: 750`
  - `color: '#475569'`
  - `background: '#f8fafc'`
  - `borderBottom: '1px solid #cbd5e1'`

## 2. Interactive Components (Height & Spacing)
- **Inputs & Select Boxes**:
  - `height: '34px'` (strictly standardized)
  - `borderRadius: '4px'`
  - `border: '1px solid #cbd5e1'`
  - `fontSize: '13px'`
  - `fontWeight: 600`
  - `color: '#1e293b'`
- **Buttons**:
  - **Primary Action (e.g. Save, Choose)**:
    - `background: '#3b82f6'` (YSACC Primary Blue)
    - Hover background: `#2563eb`
    - `color: '#fff'`
    - Height: `34px`
    - Border radius: `4px`
  - **Secondary Action (e.g. Cancel, Edit, Close)**:
    - `background: '#f1f5f9'`
    - `border: '1px solid #cbd5e1'`
    - Hover background: `#e2e8f0`
    - `color: '#475569'`
    - Height: `34px`
    - Border radius: `4px`

## 3. Modal & Frame Layouts
- **Dialog Frames**:
  - Border: `1px solid #cbd5e1`
  - Border radius: `4px`
  - Shadow: `0 20px 40px rgba(15,23,42,0.2)`
  - Header background: `#fafafa`
  - Header border bottom: `1px solid #cbd5e1`
  - Title Font: `fontSize: '16px'`, `fontWeight: 800`, `color: '#1e293b'`
