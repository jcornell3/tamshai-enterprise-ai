import { useAuth, getUserDisplayName } from '@tamshai/auth';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

/**
 * Downloads Page - Client Application Downloads
 *
 * Provides download links for all Tamshai AI native clients:
 * - Windows (MSIX installer)
 * - macOS (DMG installer)
 * - iOS (App Store link)
 * - Android (Play Store link + APK)
 *
 * Also includes links to web application for browser-based access.
 */

interface DownloadCard {
  platform: string;
  description: string;
  icon: JSX.Element;
  downloads: {
    label: string;
    url: string;
    type: 'primary' | 'secondary';
    badge?: string;
  }[];
  storeLink?: {
    label: string;
    url: string;
    icon: JSX.Element;
  };
}

export default function DownloadsPage() {
  const { userContext, signOut } = useAuth();
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch latest release version from GitHub API
  useEffect(() => {
    fetch('https://api.github.com/repos/jcornell3/tamshai-enterprise-ai/releases/latest')
      .then(res => res.json())
      .then(data => {
        if (data.tag_name) {
          setLatestVersion(data.tag_name);
        }
      })
      .catch(err => {
        console.error('Failed to fetch latest release:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // GitHub releases URL - dynamically constructed from latest release tag
  const githubReleasesBase = latestVersion
    ? `https://github.com/jcornell3/tamshai-enterprise-ai/releases/download/${latestVersion}`
    : null;

  const downloads: DownloadCard[] = [
    {
      platform: 'Windows',
      description: 'For Windows 10/11 (64-bit)',
      icon: (
        <svg className="w-12 h-12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
        </svg>
      ),
      downloads: githubReleasesBase ? [
        {
          label: 'Download MSIX Installer',
          url: `${githubReleasesBase}/tamshai-stage-windows.msix`,
          type: 'primary',
          badge: 'Recommended',
        },
        {
          label: 'Download Portable (.zip)',
          url: `${githubReleasesBase}/tamshai-stage-windows-portable.zip`,
          type: 'secondary',
        },
      ] : [],
    },
    {
      platform: 'macOS',
      description: 'For macOS 12 Monterey and later',
      icon: (
        <svg className="w-12 h-12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
      ),
      downloads: githubReleasesBase ? [
        {
          label: 'Download DMG Installer',
          url: `${githubReleasesBase}/tamshai-stage-macos.dmg`,
          type: 'primary',
          badge: 'Recommended',
        },
        {
          label: 'Download App (.zip)',
          url: `${githubReleasesBase}/tamshai-stage-macos-portable.zip`,
          type: 'secondary',
        },
      ] : [],
    },
    {
      platform: 'iOS',
      description: 'For iPhone and iPad (iOS 15+)',
      icon: (
        <svg className="w-12 h-12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
      ),
      downloads: [],
      storeLink: {
        label: 'Download on the App Store',
        url: '#', // Placeholder - update when app is published
        icon: (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
        ),
      },
    },
    {
      platform: 'Android',
      description: 'For Android 8.0 and later',
      icon: (
        <svg className="w-12 h-12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.523 15.341c-.5 0-.906.406-.906.906s.406.906.906.906.906-.406.906-.906-.406-.906-.906-.906zm-11.046 0c-.5 0-.906.406-.906.906s.406.906.906.906.906-.406.906-.906-.406-.906-.906-.906zm11.4-6.347l1.98-3.431c.11-.191.045-.436-.146-.546-.19-.11-.436-.045-.546.146l-2.005 3.475c-1.55-.708-3.29-1.102-5.16-1.102s-3.61.394-5.16 1.102L4.835 5.163c-.11-.191-.356-.256-.546-.146-.191.11-.256.355-.146.546l1.98 3.431C2.68 10.675 0 14.072 0 18.057h24c0-3.985-2.68-7.382-6.123-9.063zM6.477 15.341c-.5 0-.906.406-.906.906s.406.906.906.906.906-.406.906-.906-.406-.906-.906-.906zm11.046 0c-.5 0-.906.406-.906.906s.406.906.906.906.906-.406.906-.906-.406-.906-.906-.906z" />
        </svg>
      ),
      downloads: githubReleasesBase ? [
        {
          label: 'Download APK',
          url: `${githubReleasesBase}/tamshai-stage.apk`,
          type: 'secondary',
        },
      ] : [],
      storeLink: {
        label: 'Get it on Google Play',
        url: '#', // Placeholder - update when app is published
        icon: (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.609 1.814L13.792 12 3.61 22.186c-.181-.085-.344-.21-.476-.37A1.63 1.63 0 013 21.013V2.987c0-.298.051-.592.158-.883.134-.16.295-.284.476-.37l-.025.08zm10.831 10.186l2.944-2.944 3.655 2.12c.38.22.614.619.614 1.049 0 .43-.234.829-.614 1.049l-3.655 2.12-2.944-2.944-.075-.225.075-.225zM5.527.655L14.44 5.82l-3.203 3.203L5.527.655zm8.913 12.322l3.203 3.203-8.913 5.165 5.71-8.368z" />
          </svg>
        ),
      },
    },
  ];

  return (
    <div className="min-h-screen bg-secondary-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="page-container">
          <div className="flex items-center justify-between py-4">
            {/* Logo and Title */}
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-xl">T</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-secondary-900">
                    Tamshai Corp
                  </h1>
                  <p className="text-sm text-secondary-600">
                    Client Downloads
                  </p>
                </div>
              </Link>
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="font-medium text-secondary-900">
                  {getUserDisplayName(userContext)}
                </p>
              </div>
              <button
                onClick={() => signOut()}
                className="btn-outline text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="page-container">
        <div className="page-header">
          <Link to="/" className="text-primary-600 hover:text-primary-700 text-sm mb-2 inline-flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Portal
          </Link>
          <h2 className="page-title">Download Tamshai AI</h2>
          <p className="page-subtitle">
            Get the native app for your platform for the best AI-powered enterprise experience
          </p>
          {latestVersion && (
            <p className="text-sm text-primary-600 mt-2">
              <strong>Latest Version:</strong> {latestVersion}
            </p>
          )}
        </div>

        {/* Release Notice */}
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-medium text-amber-800">Beta Release</p>
              <p className="text-sm text-amber-700 mt-1">
                Native app downloads are available from our GitHub releases. If a download link doesn't work,
                the release may still be in progress. Check back soon or contact support.
              </p>
            </div>
          </div>
        </div>

        {/* Download Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {downloads.map((platform) => (
            <div key={platform.platform} className="card p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="text-primary-600">
                  {platform.icon}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-secondary-900">
                    {platform.platform}
                  </h3>
                  <p className="text-sm text-secondary-600">
                    {platform.description}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {/* Store Link (if available) */}
                {platform.storeLink && (
                  <a
                    href={platform.storeLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-colors ${
                      platform.storeLink.url === '#'
                        ? 'bg-secondary-200 text-secondary-500 cursor-not-allowed'
                        : 'bg-secondary-900 text-white hover:bg-secondary-800'
                    }`}
                    onClick={(e) => platform.storeLink?.url === '#' && e.preventDefault()}
                  >
                    {platform.storeLink.icon}
                    {platform.storeLink.url === '#' ? 'Coming Soon' : platform.storeLink.label}
                  </a>
                )}

                {/* Direct Downloads */}
                {platform.downloads.map((download) => (
                  <a
                    key={download.label}
                    href={download.url}
                    className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-colors ${
                      download.type === 'primary'
                        ? 'bg-primary-600 text-white hover:bg-primary-700'
                        : 'bg-secondary-100 text-secondary-700 hover:bg-secondary-200'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    {download.label}
                    {download.badge && (
                      <span className="ml-2 text-xs bg-white/20 px-2 py-0.5 rounded-full">
                        {download.badge}
                      </span>
                    )}
                  </a>
                ))}

                {/* No downloads available message */}
                {platform.downloads.length === 0 && !platform.storeLink && (
                  <p className="text-sm text-secondary-500 text-center py-4">
                    {isLoading ? 'Loading downloads...' : 'Coming soon'}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Web App Section */}
        <div className="mt-8 card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-secondary-900">
                Web Application
              </h3>
              <p className="text-sm text-secondary-600">
                Access Tamshai AI directly in your browser - no download required
              </p>
            </div>
            <Link
              to="/"
              className="btn-primary"
            >
              Open Web App
            </Link>
          </div>
        </div>

        {/* System Requirements */}
        <div className="mt-8 alert-info">
          <h4 className="font-semibold mb-2">System Requirements</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium">Windows</p>
              <p className="text-secondary-600">Windows 10/11 (64-bit), 4GB RAM</p>
            </div>
            <div>
              <p className="font-medium">macOS</p>
              <p className="text-secondary-600">macOS 12 Monterey or later, Apple Silicon or Intel</p>
            </div>
            <div>
              <p className="font-medium">iOS</p>
              <p className="text-secondary-600">iOS 15.0 or later, iPhone 8 or newer</p>
            </div>
            <div>
              <p className="font-medium">Android</p>
              <p className="text-secondary-600">Android 8.0 or later, 3GB RAM</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
