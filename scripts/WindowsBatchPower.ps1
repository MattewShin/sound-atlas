# A dedicated thread owns both native calls. PowerShell runspace thread changes
# cannot leave the request on another thread. Windows releases it if this process
# exits; no machine power policy or display request is changed.
function Start-BatchSystemAwake {
  if (-not ('ClassicAtlas.BatchSystemAwake' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
namespace ClassicAtlas {
  public sealed class BatchSystemAwake : IDisposable {
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint SetThreadExecutionState(uint flags);
    private const uint Continuous = 0x80000000;
    private const uint SystemRequired = 0x00000001;
    private readonly ManualResetEvent ready = new ManualResetEvent(false);
    private readonly ManualResetEvent stop = new ManualResetEvent(false);
    private readonly Thread owner;
    private bool disposed;
    public bool Active { get; private set; }
    public int ActivationError { get; private set; }
    public string FailureType { get; private set; }
    public bool Released { get; private set; }
    public int ReleaseError { get; private set; }
    public BatchSystemAwake() {
      owner = new Thread(Run);
      owner.IsBackground = true;
      owner.Name = "ClassicAtlas system awake";
      owner.Start();
      ready.WaitOne();
    }
    private void Run() {
      try {
        Active = SetThreadExecutionState(Continuous | SystemRequired) != 0;
        if (!Active) ActivationError = Marshal.GetLastWin32Error();
      } catch (Exception error) { FailureType = error.GetType().FullName; }
      finally { ready.Set(); }
      if (!Active) return;
      try { stop.WaitOne(); }
      finally {
        try {
          Released = SetThreadExecutionState(Continuous) != 0;
          if (!Released) ReleaseError = Marshal.GetLastWin32Error();
        } catch (Exception error) { FailureType = error.GetType().FullName; }
      }
    }
    public void Dispose() {
      if (disposed) return;
      disposed = true;
      stop.Set();
      owner.Join();
      ready.Dispose();
      stop.Dispose();
    }
  }
}
'@
  }
  return New-Object ClassicAtlas.BatchSystemAwake
}
