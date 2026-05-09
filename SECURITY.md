# Security Policy

<img src="assets/voxel.png" alt="Voxel logo" width="1024">

## Reporting a vulnerability

If you discover a security issue, please report it privately and avoid opening a public issue with exploit details.

Please include:
- A clear description of the vulnerability
- Steps to reproduce
- Impact assessment
- Affected versions/commit SHA (if known)

## Scope highlights

Areas likely to be security-sensitive in this project:
- Voice ZIP import and file extraction paths
- API key handling and provider configuration
- Uploaded audio handling/transcription pipeline
- Any command routing behavior changes

## Disclosure process

- We will acknowledge receipt as quickly as possible.
- We will investigate and validate the report.
- We will work on a fix and coordinate disclosure timing.

## Best practices for contributors

- Never commit secrets or private keys.
- Keep dependency updates reasonably current.
- Validate user-provided files and paths.
