# Data Agent boundary

This directory reserves the independent customer-side runtime described in the approved architecture.
The current milestone implements only the cloud development foundation. No agent process, dataset
upload, profiler, model training, or ML dependencies are implemented or started.

The future agent will own dataset access, local execution, artifacts, and the independently enforced
export policy. It must not import the backend's database credentials or share its runtime image.
