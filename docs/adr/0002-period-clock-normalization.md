# Period/clock convention during inter-quarter breaks

During inter-quarter breaks, the ingestion normalizer sets `period` to the quarter just completed and `clock` to `"00:00"`. It does not advance `period` to the upcoming quarter.

Providers vary: some emit `period=2, clock="00:00"` (end of Q1 completed), others emit `period=2, clock="12:00"` (Q2 not yet started). Normalizing to the "completed quarter + 00:00" convention means the client has a single unambiguous rule: `clock == "00:00" && status == "live"` means "break before period N+1." The alternative (period = upcoming quarter) is equally valid but less intuitive — a period that hasn't started yet is a future state, not a current one.
