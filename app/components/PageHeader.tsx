import { InlineGrid } from '@shopify/polaris';
import { useLocation, Link as RemixLink } from '@remix-run/react';
import HeaderIcon from '~/components/HeaderIcon';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle }) => {
  const location = useLocation();
  
  // Generate breadcrumbs based on current route
  const generateBreadcrumbs = () => {
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const breadcrumbs = [];
    
    // Always start with Dashboard
    breadcrumbs.push({ label: 'Dashboard', href: '/app' });
    
    // Build breadcrumb trail
    let currentPath = '/app';
    pathSegments.forEach((segment, index) => {
      if (segment === 'app') return; // Skip 'app' segment
      
      currentPath += `/${segment}`;
      
      // Custom labels for specific routes
      let label = segment;
      if (segment === 'buyer-group') label = 'Buyer Groups';
     if (segment === 'upsells') label = 'Upsells';
      if (segment === 'upsell-top-products') label = 'Top Products';
      if (segment === 'upsell-complementary-products') label = 'Complementary Products';
      if (segment === 'wholesaleportalaccess') label = 'Access Requests';
      if (segment === 'storeconfigs') label = 'Account Settings';
      if (segment === 'add') label = 'Create or Modify';
      
      
      // Don't make the last segment a link (current page)
      if (index === pathSegments.length - 1) {
        breadcrumbs.push({ label, href: undefined });
      } else {
        breadcrumbs.push({ label, href: currentPath });
      }
    });
    
    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  return (
    <div>
      {/* Breadcrumbs */}
      <div style={{ marginBottom: '12px' }}>
        <nav style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          fontSize: '14px',
          color: '#6b7280'
        }}>
          {breadcrumbs.map((crumb, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
              {index > 0 && (
                <span style={{ margin: '0 8px', color: '#d1d5db' }}>/</span>
              )}
              {crumb.href ? (
                <RemixLink 
                  to={crumb.href}
                  style={{ 
                    color: '#3b82f6', 
                    textDecoration: 'none',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                  onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                >
                  {crumb.label}
                </RemixLink>
              ) : (
                <span style={{ color: '#374151', fontWeight: '500' }}>
                  {crumb.label}
                </span>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Main Header */}
      <div style={{
        backgroundColor: '#1a1a1a',
        padding: '12px 20px',
        position: 'relative',
        borderRadius: '8px',
        width: '100%'
      }}>
        <InlineGrid columns={2}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}>
            <div style={{
              color: '#ffffff',
              fontSize: '18px',
              fontWeight: 600,
              marginBottom: '2px'
            }}>
              {title}
            </div>
            {subtitle && (
              <div style={{
                color: '#9e9e9e',
                fontSize: '18px',
                fontWeight: 600
              }}>
                {subtitle}
              </div>
            )}
          </div>
          <div style={{
            position: 'absolute',
            right: '1px',
            top: '40%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center'
          }}>
            <HeaderIcon color="#ffffff" size={100} />
          </div>
        </InlineGrid>
      </div>
    </div>
  );
};

export default PageHeader; 