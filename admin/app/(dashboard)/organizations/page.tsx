'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Chip, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { api } from '@/lib/api/browser';
import { PageHeader } from '@/components/PageHeader';

interface Org {
  id: string;
  name: string;
  code: string;
  timezone: string;
  isActive: boolean;
}

export default function OrganizationsPage() {
  const orgs = useQuery({ queryKey: ['organizations'], queryFn: () => api.get<Org[]>('/organizations') });

  return (
    <>
      <PageHeader title="Organizations" subtitle="Top-level tenants" />
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Code</TableCell>
              <TableCell>Timezone</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orgs.data?.map((o) => (
              <TableRow key={o.id} hover>
                <TableCell>{o.name}</TableCell>
                <TableCell>{o.code}</TableCell>
                <TableCell>{o.timezone}</TableCell>
                <TableCell>
                  <Chip size="small" color={o.isActive ? 'success' : 'default'} label={o.isActive ? 'Active' : 'Inactive'} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
